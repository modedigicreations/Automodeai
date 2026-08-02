import Anthropic from "@anthropic-ai/sdk";
import type { AgentConfig, AgentResult, ToolDefinition } from "./types.js";

const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-chat";
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_TOKENS = 16_000;
const MAX_MESSAGE_ITERATIONS = 10;
const MAX_VALIDATION_RETRIES = 3;

interface MessageLoopResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export class Agent {
  private client: Anthropic | null;
  private config: AgentConfig;
  private phaseName: string;

  constructor(client: Anthropic | null, config: AgentConfig, phaseName: string) {
    this.client = client;
    this.config = config;
    this.phaseName = phaseName;
  }

  get name(): string {
    return this.config.name;
  }

  async run(input: string): Promise<AgentResult> {
    this.validateInput(input);

    const startTime = Date.now();
    const tools = this.config.tools ?? [];
    const anthropicTools = this.toAnthropicTools(tools);
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: input },
    ];

    let usage = { inputTokens: 0, outputTokens: 0 };
    let finalText = "";

    const initialResult = await this.runMessageLoop(messages, tools, anthropicTools);
    usage = this.addUsage(usage, initialResult);
    finalText = initialResult.text;

    if (this.config.outputSchema) {
      for (let attempt = 0; attempt <= MAX_VALIDATION_RETRIES; attempt++) {
        const validation = this.validateOutput(finalText);
        if (validation.success) {
          break;
        }

        if (attempt === MAX_VALIDATION_RETRIES) {
          throw new Error(
            `[${this.config.name}] Output validation failed after ${MAX_VALIDATION_RETRIES} correction attempts: ${validation.error}\nRaw output: ${finalText}`,
          );
        }

        console.warn(
          `   │  Warning: [${this.config.name}] Output validation failed (attempt ${attempt + 1}/${MAX_VALIDATION_RETRIES + 1}): ${validation.error}. Requesting self-correction...`,
        );

        messages.push({ role: "assistant", content: [{ type: "text", text: finalText }] });
        messages.push({
          role: "user",
          content: `Output validation failed against the schema:
Error details: ${validation.error}

Please correct your output to strictly conform to the required format/schema. If outputting JSON, do not wrap it in markdown block tags, just output clean JSON.`,
        });

        const correction = await this.runMessageLoop(messages, tools, anthropicTools);
        usage = this.addUsage(usage, correction);
        finalText = correction.text;
      }
    }

    const provider = this.config.provider ?? (this.config.model?.includes("deepseek") ? "deepseek" : "anthropic");

    return {
      agentName: this.config.name,
      phaseName: this.phaseName,
      output: finalText,
      usage,
      durationMs: Date.now() - startTime,
      model: this.config.model ?? (provider === "deepseek" ? DEFAULT_DEEPSEEK_MODEL : DEFAULT_MODEL),
    };
  }

  private validateInput(input: string): void {
    if (!this.config.inputSchema) {
      return;
    }

    const parsed = this.config.inputSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(
        `[${this.config.name}] Input validation failed: ${parsed.error.message}`,
      );
    }
  }

  private validateOutput(output: string): { success: true } | { success: false; error: string } {
    if (!this.config.outputSchema) {
      return { success: true };
    }

    let dataToValidate: unknown = output;
    try {
      dataToValidate = JSON.parse(output);
    } catch {
      // Validate the raw text when the response is not JSON.
    }

    const parsed = this.config.outputSchema.safeParse(dataToValidate);
    if (parsed.success) {
      return { success: true };
    }

    return { success: false, error: parsed.error.message };
  }

  private async runMessageLoop(
    messages: Anthropic.MessageParam[],
    tools: ToolDefinition[],
    anthropicTools: Anthropic.Tool[],
  ): Promise<MessageLoopResult> {
    const provider = this.config.provider ?? (this.config.model?.includes("deepseek") ? "deepseek" : "anthropic");
    let inputTokens = 0;
    let outputTokens = 0;

    for (let i = 0; i < MAX_MESSAGE_ITERATIONS; i++) {
      let response: {
        content: Anthropic.ContentBlock[];
        stop_reason: string;
        usage: { input_tokens: number; output_tokens: number };
      };

      if (provider === "deepseek") {
        response = await this.callDeepSeek(messages, tools);
      } else {
        if (!this.client) {
          throw new Error(`[${this.config.name}] Anthropic client is not initialized.`);
        }
        const apiResponse = await this.callWithTimeout(
          () =>
            this.client!.messages.create({
              model: this.config.model ?? DEFAULT_MODEL,
              max_tokens: this.config.maxTokens ?? DEFAULT_MAX_TOKENS,
              system: this.config.role,
              messages,
              ...(anthropicTools.length > 0 ? { tools: anthropicTools } : {}),
            }),
          this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        );

        response = {
          content: apiResponse.content,
          stop_reason: apiResponse.stop_reason ?? "end_turn",
          usage: {
            input_tokens: apiResponse.usage.input_tokens,
            output_tokens: apiResponse.usage.output_tokens,
          },
        };
      }

      inputTokens += response.usage.input_tokens;
      outputTokens += response.usage.output_tokens;

      if (response.stop_reason === "refusal") {
        throw new Error(
          `[${this.config.name}] Agent refused the request. This may be due to content policy restrictions.`,
        );
      }

      if (response.stop_reason === "max_tokens") {
        throw new Error(
          `[${this.config.name}] Agent stopped because max_tokens was reached. Increase maxTokens or narrow the task to avoid truncated output.`,
        );
      }

      if (response.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content: response.content });
        messages.push({
          role: "user",
          content: await this.executeToolCalls(response.content, tools),
        });
        continue;
      }

      const text = this.extractText(response.content).trim();
      if (!text) {
        throw new Error(`[${this.config.name}] Agent produced no text output.`);
      }

      return { text, inputTokens, outputTokens };
    }

    throw new Error(
      `[${this.config.name}] Agent exceeded ${MAX_MESSAGE_ITERATIONS} message iterations without producing final output.`,
    );
  }

  private async callDeepSeek(
    messages: Anthropic.MessageParam[],
    tools: ToolDefinition[],
  ): Promise<{
    content: Anthropic.ContentBlock[];
    stop_reason: string;
    usage: { input_tokens: number; output_tokens: number };
  }> {
    const apiKey = this.config.deepseekApiKey || process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error(`[${this.config.name}] DEEPSEEK_API_KEY environment variable or config deepseekApiKey is required.`);
    }

    const openAIMessages = [
      { role: "system", content: this.config.role },
      ...this.toOpenAIMessages(messages),
    ];

    const openAITools = this.toOpenAITools(tools);

    const body = {
      model: this.config.model ?? DEFAULT_DEEPSEEK_MODEL,
      messages: openAIMessages,
      temperature: 0.7,
      max_tokens: this.config.maxTokens ?? DEFAULT_MAX_TOKENS,
      ...(openAITools.length > 0 ? { tools: openAITools } : {}),
    };

    const responseJson = await this.callWithTimeout(
      async () => {
        const res = await globalThis.fetch("https://api.deepseek.com/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(`DeepSeek API returned status ${res.status}: ${errText}`);
        }

        return res.json();
      },
      this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );

    const choice = responseJson.choices?.[0];
    if (!choice) {
      throw new Error(`[${this.config.name}] Invalid response structure from DeepSeek API.`);
    }

    const messageContent: Anthropic.ContentBlock[] = [];
    if (choice.message.content) {
      messageContent.push({
        type: "text",
        text: choice.message.content,
      } as any);
    }

    if (choice.message.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        let parsedInput = {};
        try {
          parsedInput = JSON.parse(tc.function.arguments);
        } catch {
          // Ignore parse errors
        }
        messageContent.push({
          type: "tool_use",
          id: tc.id,
          name: tc.function.name,
          input: parsedInput,
        } as any);
      }
    }

    let stopReason = "end_turn";
    if (choice.finish_reason === "tool_calls") {
      stopReason = "tool_use";
    } else if (choice.finish_reason === "length") {
      stopReason = "max_tokens";
    } else if (choice.finish_reason === "content_filter") {
      stopReason = "refusal";
    }

    return {
      content: messageContent,
      stop_reason: stopReason,
      usage: {
        input_tokens: responseJson.usage?.prompt_tokens ?? 0,
        output_tokens: responseJson.usage?.completion_tokens ?? 0,
      },
    };
  }

  private toOpenAIMessages(anthropicMessages: Anthropic.MessageParam[]): any[] {
    const openAIMessages: any[] = [];
    for (const msg of anthropicMessages) {
      if (typeof msg.content === "string") {
        openAIMessages.push({ role: msg.role, content: msg.content });
      } else if (Array.isArray(msg.content)) {
        const toolResults = msg.content.filter((b) => b.type === "tool_result") as Anthropic.ToolResultBlockParam[];
        if (toolResults.length > 0) {
          for (const tr of toolResults) {
            openAIMessages.push({
              role: "tool",
              tool_call_id: tr.tool_use_id,
              content: typeof tr.content === "string" ? tr.content : JSON.stringify(tr.content),
            });
          }
        } else {
          const textBlock = msg.content.find((b) => b.type === "text") as Anthropic.TextBlock | undefined;
          const toolUseBlocks = msg.content.filter((b) => b.type === "tool_use") as Anthropic.ToolUseBlock[];

          const openAIMsg: any = { role: msg.role };
          openAIMsg.content = textBlock ? textBlock.text : null;

          if (toolUseBlocks.length > 0) {
            openAIMsg.tool_calls = toolUseBlocks.map((tb) => ({
              id: tb.id,
              type: "function",
              function: {
                name: tb.name,
                arguments: JSON.stringify(tb.input),
              },
            }));
          }
          openAIMessages.push(openAIMsg);
        }
      }
    }
    return openAIMessages;
  }

  private toOpenAITools(tools: ToolDefinition[]): any[] {
    return tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }));
  }

  private async executeToolCalls(
    content: Anthropic.ContentBlock[],
    tools: ToolDefinition[],
  ): Promise<Anthropic.ToolResultBlockParam[]> {
    const toolUseBlocks = content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );

    return Promise.all(
      toolUseBlocks.map(async (block): Promise<Anthropic.ToolResultBlockParam> => {
        const tool = this.findTool(tools, block.name);
        let result: string;
        let isError = false;
        try {
          result = await tool.execute(block.input as Record<string, unknown>);
        } catch (err) {
          result = `Error: ${err instanceof Error ? err.message : String(err)}`;
          isError = true;
        }

        return {
          type: "tool_result",
          tool_use_id: block.id,
          content: result,
          ...(isError ? { is_error: true } : {}),
        };
      }),
    );
  }

  private toAnthropicTools(tools: ToolDefinition[]): Anthropic.Tool[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema,
    }));
  }

  private addUsage(
    total: { inputTokens: number; outputTokens: number },
    next: MessageLoopResult,
  ): { inputTokens: number; outputTokens: number } {
    return {
      inputTokens: total.inputTokens + next.inputTokens,
      outputTokens: total.outputTokens + next.outputTokens,
    };
  }

  private async callWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    let timeoutId: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`[${this.config.name}] API call timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      return await Promise.race([fn(), timeoutPromise]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  private extractText(content: Anthropic.ContentBlock[]): string {
    return content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");
  }

  private findTool(tools: ToolDefinition[], name: string): ToolDefinition {
    const tool = tools.find((t) => t.name === name);
    if (!tool) {
      throw new Error(`[${this.config.name}] Unknown tool: ${name}`);
    }
    return tool;
  }
}
