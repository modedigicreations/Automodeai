import { test, describe } from "node:test";
import assert from "node:assert";
import { SwarmContext } from "./context.js";
import type { AgentResult } from "./types.js";

describe("SwarmContext", () => {
  test("should initialize with user prompt and empty results", () => {
    const context = new SwarmContext("Test prompt");
    assert.strictEqual(context.userPrompt, "Test prompt");
    assert.deepStrictEqual(context.getAllResults(), []);
  });

  test("should add and retrieve agent results", () => {
    const context = new SwarmContext("Test prompt");
    const result: AgentResult = {
      agentName: "Agent A",
      phaseName: "Phase 1",
      output: "Agent A output",
      usage: { inputTokens: 10, outputTokens: 20 },
      durationMs: 100,
    };

    context.addResult(result);
    assert.deepStrictEqual(context.getResult("Agent A"), result);
    assert.deepStrictEqual(context.getAllResults(), [result]);
    assert.deepStrictEqual(context.getPhaseResults("Phase 1"), [result]);
    assert.deepStrictEqual(context.getPhaseResults("Phase 2"), []);
  });

  test("should compute total tokens correctly", () => {
    const context = new SwarmContext("Test prompt");
    const resultA: AgentResult = {
      agentName: "Agent A",
      phaseName: "Phase 1",
      output: "Agent A output",
      usage: { inputTokens: 10, outputTokens: 20 },
      durationMs: 100,
    };
    const resultB: AgentResult = {
      agentName: "Agent B",
      phaseName: "Phase 1",
      output: "Agent B output",
      usage: { inputTokens: 5, outputTokens: 15 },
      durationMs: 150,
    };

    context.addResult(resultA);
    context.addResult(resultB);

    assert.deepStrictEqual(context.totalTokens, { input: 15, output: 35 });
  });

  test("should build agent input correctly without completed work", () => {
    const context = new SwarmContext("Test prompt");
    const input = context.buildAgentInput("Agent A");

    assert.ok(input.includes("Original request: Test prompt"));
    assert.ok(input.includes("You are the Agent A."));
    assert.ok(!input.includes("Completed work from other agents"));
  });

  test("should build agent input correctly with completed work", () => {
    const context = new SwarmContext("Test prompt");
    const result: AgentResult = {
      agentName: "Agent A",
      phaseName: "Phase 1",
      output: "Agent A output info",
      usage: { inputTokens: 10, outputTokens: 20 },
      durationMs: 100,
    };
    context.addResult(result);

    const input = context.buildAgentInput("Agent B");
    assert.ok(input.includes("Original request: Test prompt"));
    assert.ok(input.includes("Completed work from other agents"));
    assert.ok(input.includes("[Agent A]:\nAgent A output info"));
    assert.ok(input.includes("You are the Agent B. Using the original request and the completed work above"));
  });

  test("should build final output correctly", () => {
    const context = new SwarmContext("Test prompt");
    context.addResult({
      agentName: "Agent A",
      phaseName: "Phase 1",
      output: "Output A",
      usage: { inputTokens: 10, outputTokens: 20 },
      durationMs: 100,
    });
    context.addResult({
      agentName: "Agent B",
      phaseName: "Phase 2",
      output: "Output B",
      usage: { inputTokens: 5, outputTokens: 15 },
      durationMs: 150,
    });

    const expected = "## Agent A\n\nOutput A\n\n---\n\n## Agent B\n\nOutput B";
    assert.strictEqual(context.buildFinalOutput(), expected);
  });
});
