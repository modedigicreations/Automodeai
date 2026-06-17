import Anthropic from "@anthropic-ai/sdk";
import type { AgentConfig, AgentResult, ToolDefinition } from "./types.js";

const DEFAULT_MODEL = "claude-sonnet-4-6";

export class Agent {
  private client: Anthropic;
  private config: AgentConfig;
  private phaseName: string;

  constructor(client: Anthropic, config: AgentConfig, phaseName: string) {
    this.client = client;
    this.config = config;
    this.phaseName = phaseName;
  }

  get name(): string {
    return this.config.name;
  }

  async run(input: string): Promise<AgentResult> {
    if (this.config.inputSchema) {
      const parsed = this.config.inputSchema.safeParse(input);
      if (!parsed.success) {
        throw new Error(
          `[${this.config.name}] Input validation failed: ${parsed.error.message}`,
        );
      }
    }

    const startTime = Date.now();
    const tools = this.config.tools ?? [];
    const anthropicTools: Anthropic.Tool[] = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    }));

    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: input },
    ];

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let finalText = "";

    const maxIterations = 10;
    for (let i = 0; i < maxIterations; i++) {
      const response = await this.client.messages.create({
        model: this.config.model ?? DEFAULT_MODEL,
        max_tokens: 16000,
        system: this.config.role,
        messages,
        ...(anthropicTools.length > 0 ? { tools: anthropicTools } : {}),
      });

      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;

      if (response.stop_reason === "end_turn" || response.stop_reason === "max_tokens") {
        finalText = this.extractText(response.content);
        break;
      }

      if (response.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content: response.content });

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of response.content) {
          if (block.type === "tool_use") {
            const tool = this.findTool(tools, block.name);
            let result: string;
            try {
              result = await tool.execute(
                block.input as Record<string, unknown>,
              );
            } catch (err) {
              result = `Error: ${err instanceof Error ? err.message : String(err)}`;
            }
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: result,
            });
          }
        }

        messages.push({ role: "user", content: toolResults });
        continue;
      }

      finalText = this.extractText(response.content);
      break;
    }

    if (this.config.outputSchema) {
      const parsed = this.config.outputSchema.safeParse(finalText);
      if (!parsed.success) {
        throw new Error(
          `[${this.config.name}] Output validation failed: ${parsed.error.message}`,
        );
      }
    }

    return {
      agentName: this.config.name,
      phaseName: this.phaseName,
      output: finalText,
      usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      durationMs: Date.now() - startTime,
    };
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
