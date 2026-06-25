import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { Swarm } from "./swarm.js";
import { Agent } from "./agent.js";
import type { AgentResult, SwarmConfig } from "./types.js";

describe("Swarm", () => {
  let originalAgentRun: typeof Agent.prototype.run;
  let originalApiKey: string | undefined;

  before(() => {
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

    assert.strictEqual(runHistory.length, 2);
    assert.strictEqual(runHistory[0].name, "AgentA");
    assert.strictEqual(runHistory[1].name, "AgentB");

    assert.ok(runHistory[1].input.includes("=== Completed work from other agents ==="));
    assert.ok(runHistory[1].input.includes("[AgentA]:\nOutput from AgentA"));

    assert.strictEqual(
      result.output,
      "## AgentA\n\nOutput from AgentA\n\n---\n\n## AgentB\n\nOutput from AgentB"
    );

    assert.ok(result.estimatedCost.total >= 0);
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

    const startDifference = Math.abs(startedTimes["Agent1"] - startedTimes["Agent2"]);
    assert.ok(startDifference < 25, `Expected parallel starts to be close, got difference of ${startDifference}ms`);

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

    assert.strictEqual(callCount, 2);
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
      /Agent "FailingAgent" failed/
    );
  });

  test("should continue on agent failure when continueOnAgentFailure is true", async () => {
    let callCount = 0;

    Agent.prototype.run = async function (this: Agent): Promise<AgentResult> {
      callCount++;
      if (this.name === "FailAgent") {
        throw new Error("I always fail");
      }
      return {
        agentName: this.name,
        phaseName: "mock-phase",
        output: `Success from ${this.name}`,
        usage: { inputTokens: 5, outputTokens: 5 },
        durationMs: 10,
      };
    };

    const config: SwarmConfig = {
      name: "PartialSwarm",
      description: "Partial failure test",
      maxRetries: 0,
      continueOnAgentFailure: true,
      phases: [
        {
          name: "Phase One",
          agents: [
            { name: "GoodAgent", role: "Works" },
            { name: "FailAgent", role: "Fails" },
          ],
        },
      ],
    };

    const swarm = new Swarm(config);
    const result = await swarm.run("Start");

    const good = result.agents.find((a) => a.agentName === "GoodAgent");
    const bad = result.agents.find((a) => a.agentName === "FailAgent");
    assert.ok(good);
    assert.strictEqual(good.output, "Success from GoodAgent");
    assert.ok(bad);
    assert.ok(bad.error);
    assert.ok(result.output.includes("GoodAgent"));
    assert.ok(!result.output.includes("FailAgent"));
  });

  test("should respect maxConcurrency on phases", async () => {
    let concurrentCount = 0;
    let maxConcurrent = 0;

    Agent.prototype.run = async function (this: Agent): Promise<AgentResult> {
      concurrentCount++;
      if (concurrentCount > maxConcurrent) maxConcurrent = concurrentCount;
      await new Promise((resolve) => setTimeout(resolve, 30));
      concurrentCount--;
      return {
        agentName: this.name,
        phaseName: "mock-phase",
        output: `Done ${this.name}`,
        usage: { inputTokens: 1, outputTokens: 1 },
        durationMs: 30,
      };
    };

    const config: SwarmConfig = {
      name: "ConcurrencySwarm",
      description: "Concurrency limit test",
      phases: [
        {
          name: "Limited Phase",
          agents: [
            { name: "A1", role: "R" },
            { name: "A2", role: "R" },
            { name: "A3", role: "R" },
            { name: "A4", role: "R" },
          ],
          maxConcurrency: 2,
        },
      ],
    };

    const swarm = new Swarm(config);
    await swarm.run("Go");

    assert.ok(maxConcurrent <= 2, `Expected max 2 concurrent, got ${maxConcurrent}`);
  });

  test("should call lifecycle hooks", async () => {
    const events: string[] = [];

    Agent.prototype.run = async function (this: Agent): Promise<AgentResult> {
      return {
        agentName: this.name,
        phaseName: "mock-phase",
        output: "ok",
        usage: { inputTokens: 1, outputTokens: 1 },
        durationMs: 1,
      };
    };

    const config: SwarmConfig = {
      name: "HookSwarm",
      description: "Hook test",
      onPhaseStart: (name) => events.push(`phase-start:${name}`),
      onPhaseComplete: (result) => events.push(`phase-complete:${result.name}`),
      onAgentComplete: (result) => events.push(`agent-complete:${result.agentName}`),
      phases: [
        {
          name: "P1",
          agents: [{ name: "A1", role: "R" }],
        },
      ],
    };

    const swarm = new Swarm(config);
    await swarm.run("Go");

    assert.deepStrictEqual(events, [
      "phase-start:P1",
      "agent-complete:A1",
      "phase-complete:P1",
    ]);
  });
});
