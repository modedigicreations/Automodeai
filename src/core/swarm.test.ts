import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { Swarm } from "./swarm.js";
import { Agent } from "./agent.js";
import type { AgentResult, SwarmConfig } from "./types.js";

describe("Swarm", () => {
  let originalAgentRun: typeof Agent.prototype.run;
  let originalApiKey: string | undefined;

  before(() => {
    // Set a dummy API key so Swarm initialization doesn't throw
    originalApiKey = process.env["ANTHROPIC_API_KEY"];
    process.env["ANTHROPIC_API_KEY"] = "dummy-api-key";
    originalAgentRun = Agent.prototype.run;
  });

  after(() => {
    Agent.prototype.run = originalAgentRun;
    if (originalApiKey === undefined) {
      delete process.env["ANTHROPIC_API_KEY"];
    } else {
      process.env["ANTHROPIC_API_KEY"] = originalApiKey;
    }
  });

  test("should orchestrate sequential phases and accumulate outputs", async () => {
    const runHistory: { name: string; input: string }[] = [];

    Agent.prototype.run = async function (this: Agent, input: string): Promise<AgentResult> {
      runHistory.push({ name: this.name, input });
      return {
        agentName: this.name,
        phaseName: "mock-phase",
        output: `Output from ${this.name}`,
        usage: { inputTokens: 5, outputTokens: 5 },
        durationMs: 10,
      };
    };

    const config: SwarmConfig = {
      name: "TestSwarm",
      description: "A simple two-phase swarm",
      phases: [
        {
          name: "Phase One",
          agents: [
            { name: "AgentA", role: "Role A" },
          ],
        },
        {
          name: "Phase Two",
          agents: [
            { name: "AgentB", role: "Role B" },
          ],
        },
      ],
    };

    const swarm = new Swarm(config);
    const result = await swarm.run("Hello");

    // Phase Two should run after Phase One and receive Phase One's outputs
    assert.strictEqual(runHistory.length, 2);
    assert.strictEqual(runHistory[0].name, "AgentA");
    assert.strictEqual(runHistory[1].name, "AgentB");

    assert.ok(runHistory[1].input.includes("=== Completed work from other agents ==="));
    assert.ok(runHistory[1].input.includes("[AgentA]:\nOutput from AgentA"));

    // Check final output format
    assert.strictEqual(
      result.output,
      "## AgentA\n\nOutput from AgentA\n\n---\n\n## AgentB\n\nOutput from AgentB"
    );
  });

  test("should execute agents in parallel within the same phase", async () => {
    const startedTimes: Record<string, number> = {};

    Agent.prototype.run = async function (this: Agent): Promise<AgentResult> {
      startedTimes[this.name] = Date.now();
      await new Promise((resolve) => setTimeout(resolve, 50));
      return {
        agentName: this.name,
        phaseName: "mock-phase",
        output: `Done ${this.name}`,
        usage: { inputTokens: 1, outputTokens: 1 },
        durationMs: 50,
      };
    };

    const config: SwarmConfig = {
      name: "ParallelSwarm",
      description: "Phase with parallel agents",
      phases: [
        {
          name: "Parallel Phase",
          agents: [
            { name: "Agent1", role: "Role 1" },
            { name: "Agent2", role: "Role 2" },
          ],
        },
      ],
    };

    const swarm = new Swarm(config);
    const swarmStart = Date.now();
    await swarm.run("Hello");
    const swarmDuration = Date.now() - swarmStart;

    // Both agents must start almost simultaneously
    const startDifference = Math.abs(startedTimes["Agent1"] - startedTimes["Agent2"]);
    assert.ok(startDifference < 25, `Expected parallel starts to be close, got difference of ${startDifference}ms`);

    // Total duration should be close to 50ms, not 100ms (sequential)
    assert.ok(swarmDuration < 90, `Expected duration to be parallel (<90ms), got ${swarmDuration}ms`);
  });

  test("should handle retries on agent failure", async () => {
    let callCount = 0;

    Agent.prototype.run = async function (this: Agent): Promise<AgentResult> {
      callCount++;
      if (callCount === 1) {
        throw new Error("Temporary network glitch");
      }
      return {
        agentName: this.name,
        phaseName: "mock-phase",
        output: "Success after retry",
        usage: { inputTokens: 10, outputTokens: 10 },
        durationMs: 5,
      };
    };

    const config: SwarmConfig = {
      name: "RetrySwarm",
      description: "Retry test",
      maxRetries: 2,
      phases: [
        {
          name: "Phase One",
          agents: [
            { name: "RetryAgent", role: "Test" },
          ],
        },
      ],
    };

    const swarm = new Swarm(config);
    const result = await swarm.run("Start");

    assert.strictEqual(callCount, 2); // 1 failure + 1 retry
    assert.strictEqual(result.agents[0].output, "Success after retry");
  });

  test("should fail if retries exhausted", async () => {
    Agent.prototype.run = async function (this: Agent): Promise<AgentResult> {
      throw new Error("Permanent error");
    };

    const config: SwarmConfig = {
      name: "FailSwarm",
      description: "Failure test",
      maxRetries: 1,
      phases: [
        {
          name: "Phase One",
          agents: [
            { name: "FailingAgent", role: "Test" },
          ],
        },
      ],
    };

    const swarm = new Swarm(config);
    await assert.rejects(
      async () => swarm.run("Start"),
      /Agent "FailingAgent" failed after 2 attempts/
    );
  });
});
