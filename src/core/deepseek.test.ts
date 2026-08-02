import { test, describe } from "node:test";
import assert from "node:assert";
import { Agent } from "./agent.js";
import { defineTool } from "../tools/tool.js";

describe("Agent DeepSeek Provider", () => {
  const originalFetch = globalThis.fetch;

  test("should succeed with standard response from DeepSeek API", async () => {
    globalThis.fetch = async (url: any, options: any) => {
      assert.strictEqual(url.toString(), "https://api.deepseek.com/chat/completions");
      const body = JSON.parse(options.body);
      assert.strictEqual(body.model, "deepseek-chat");
      
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                role: "assistant",
                content: "Hello from DeepSeek"
              },
              finish_reason: "stop"
            }
          ],
          usage: {
            prompt_tokens: 15,
            completion_tokens: 25
          }
        })
      } as any;
    };

    try {
      const agent = new Agent(null, {
        name: "DeepSeekAgent",
        role: "You are a DeepSeek assistant",
        provider: "deepseek",
        deepseekApiKey: "mock-key"
      }, "Phase 1");

      const result = await agent.run("Hi");
      assert.strictEqual(result.agentName, "DeepSeekAgent");
      assert.strictEqual(result.output, "Hello from DeepSeek");
      assert.strictEqual(result.usage.inputTokens, 15);
      assert.strictEqual(result.usage.outputTokens, 25);
      assert.strictEqual(result.model, "deepseek-chat");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("should support tool execution loops with DeepSeek", async () => {
    let callCount = 0;
    
    globalThis.fetch = async (url: any, options: any) => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: "call_123",
                      type: "function",
                      function: {
                        name: "mock_tool",
                        arguments: JSON.stringify({ arg: "test" })
                      }
                    }
                  ]
                },
                finish_reason: "tool_calls"
              }
            ],
            usage: { prompt_tokens: 5, completion_tokens: 5 }
          })
        } as any;
      } else {
        const body = JSON.parse(options.body);
        const toolMsg = body.messages.find((m: any) => m.role === "tool");
        assert.ok(toolMsg);
        assert.strictEqual(toolMsg.tool_call_id, "call_123");
        assert.strictEqual(toolMsg.content, "Result: test");

        return {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "Final text with Tool Result"
                },
                finish_reason: "stop"
              }
            ],
            usage: { prompt_tokens: 10, completion_tokens: 10 }
          })
        } as any;
      }
    };

    const mockTool = defineTool({
      name: "mock_tool",
      description: "A tool for testing",
      parameters: {
        arg: { type: "string", description: "an argument" }
      },
      execute: async (input) => `Result: ${input.arg}`
    });

    try {
      const agent = new Agent(null, {
        name: "DeepSeekAgentWithTools",
        role: "You use tools",
        provider: "deepseek",
        deepseekApiKey: "mock-key",
        tools: [mockTool]
      }, "Phase 1");

      const result = await agent.run("Run tool");
      assert.strictEqual(result.output, "Final text with Tool Result");
      assert.strictEqual(callCount, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
