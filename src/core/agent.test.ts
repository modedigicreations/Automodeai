import { test, describe } from "node:test";
import assert from "node:assert";
import { Agent } from "./agent.js";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { defineTool } from "../tools/tool.js";

describe("Agent", () => {
  const createMockResponse = (text: string, stopReason: string = "end_turn", toolCalls: any[] = []): Anthropic.Message => {
    return {
      id: "msg_123",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-4-6",
      stop_reason: stopReason,
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 20 },
      content: [
        { type: "text", text },
        ...toolCalls,
      ],
    } as unknown as Anthropic.Message;
  };

  test("should succeed with standard response", async () => {
    const mockClient = {
      messages: {
        create: async () => createMockResponse("Hello world"),
      },
    } as unknown as Anthropic;

    const agent = new Agent(mockClient, {
      name: "TestAgent",
      role: "You are a test helper",
    }, "Phase 1");

    const result = await agent.run("Hi");
    assert.strictEqual(result.agentName, "TestAgent");
    assert.strictEqual(result.phaseName, "Phase 1");
    assert.strictEqual(result.output, "Hello world");
    assert.strictEqual(result.usage.inputTokens, 10);
    assert.strictEqual(result.usage.outputTokens, 20);
  });

  test("should enforce input schema validation", async () => {
    const mockClient = {
      messages: {
        create: async () => createMockResponse("Done"),
      },
    } as unknown as Anthropic;

    const agent = new Agent(mockClient, {
      name: "TestAgent",
      role: "Test",
      inputSchema: z.string().startsWith("valid"),
    }, "Phase 1");

    // Valid input
    const result = await agent.run("valid-input");
    assert.strictEqual(result.output, "Done");

    // Invalid input
    await assert.rejects(
      async () => agent.run("invalid-input"),
      /Input validation failed/
    );
  });

  test("should parse JSON and validate output schema", async () => {
    const mockClient = {
      messages: {
        create: async () => createMockResponse(JSON.stringify({ status: "success", count: 42 })),
      },
    } as unknown as Anthropic;

    const agent = new Agent(mockClient, {
      name: "TestAgent",
      role: "Test",
      outputSchema: z.object({
        status: z.string(),
        count: z.number(),
      }),
    }, "Phase 1");

    const result = await agent.run("Hi");
    assert.strictEqual(result.output, '{"status":"success","count":42}');
  });

  test("should attempt self-correction on output schema validation failure", async () => {
    let callCount = 0;
    const mockClient = {
      messages: {
        create: async () => {
          callCount++;
          if (callCount === 1) {
            // First response is invalid
            return createMockResponse("invalid-format");
          } else {
            // Second response (corrected) is valid JSON
            return createMockResponse(JSON.stringify({ code: 200 }));
          }
        },
      },
    } as unknown as Anthropic;

    const agent = new Agent(mockClient, {
      name: "TestAgent",
      role: "Test",
      outputSchema: z.object({
        code: z.number(),
      }),
    }, "Phase 1");

    const result = await agent.run("Hi");
    assert.strictEqual(callCount, 2); // 1 initial + 1 correction
    assert.strictEqual(result.output, '{"code":200}');
  });

  test("should fail after maximum correction attempts", async () => {
    const mockClient = {
      messages: {
        create: async () => createMockResponse("permanently-invalid"),
      },
    } as unknown as Anthropic;

    const agent = new Agent(mockClient, {
      name: "TestAgent",
      role: "Test",
      outputSchema: z.object({
        code: z.number(),
      }),
    }, "Phase 1");

    await assert.rejects(
      async () => agent.run("Hi"),
      /Output validation failed after 3 correction attempts/
    );
  });

  test("should handle tool execution loop correctly", async () => {
    let callCount = 0;
    let toolExecuted = false;

    const mockTool = defineTool({
      name: "test_tool",
      description: "A tool to test",
      parameters: { arg: { type: "string", description: "an arg" } },
      execute: async (input) => {
        toolExecuted = true;
        return `Tool result for ${input.arg}`;
      },
    });

    const mockClient = {
      messages: {
        create: async (params: any) => {
          callCount++;
          if (callCount === 1) {
            // Return tool use block
            return createMockResponse("", "tool_use", [
              {
                type: "tool_use",
                id: "tool_use_1",
                name: "test_tool",
                input: { arg: "hello" },
              },
            ]);
          } else {
            // Tool output has been fed back, now return final output
            assert.deepStrictEqual(params.messages[1].role, "assistant");
            assert.deepStrictEqual(params.messages[2].role, "user");
            assert.deepStrictEqual(params.messages[2].content[0].type, "tool_result");
            assert.deepStrictEqual(params.messages[2].content[0].content, "Tool result for hello");
            return createMockResponse("Final text after tool execution");
          }
        },
      },
    } as unknown as Anthropic;

    const agent = new Agent(mockClient, {
      name: "TestAgent",
      role: "Test",
      tools: [mockTool],
    }, "Phase 1");

    const result = await agent.run("Hi");
    assert.ok(toolExecuted);
    assert.strictEqual(callCount, 2);
    assert.strictEqual(result.output, "Final text after tool execution");
  });

  test("should enforce agent timeout", async () => {
    const mockClient = {
      messages: {
        create: async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return createMockResponse("Done");
        },
      },
    } as unknown as Anthropic;

    const agent = new Agent(mockClient, {
      name: "TimeoutAgent",
      role: "Test",
      timeoutMs: 10, // extremely low timeout
    }, "Phase 1");

    await assert.rejects(
      async () => agent.run("Hi"),
      /API call timed out after 10ms/
    );
  });

  test("should reject truncated max_tokens responses", async () => {
    const mockClient = {
      messages: {
        create: async () => createMockResponse("Partial output", "max_tokens"),
      },
    } as unknown as Anthropic;

    const agent = new Agent(mockClient, {
      name: "TruncatedAgent",
      role: "Test",
    }, "Phase 1");

    await assert.rejects(
      async () => agent.run("Hi"),
      /max_tokens was reached/
    );
  });

  test("should pass configured maxTokens to Claude", async () => {
    let receivedMaxTokens = 0;
    const mockClient = {
      messages: {
        create: async (params: { max_tokens: number }) => {
          receivedMaxTokens = params.max_tokens;
          return createMockResponse("Done");
        },
      },
    } as unknown as Anthropic;

    const agent = new Agent(mockClient, {
      name: "MaxTokenAgent",
      role: "Test",
      maxTokens: 1234,
    }, "Phase 1");

    await agent.run("Hi");
    assert.strictEqual(receivedMaxTokens, 1234);
  });
});
