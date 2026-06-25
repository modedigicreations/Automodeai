import Anthropic from "@anthropic-ai/sdk";
import { Agent } from "./agent.js";
import { SwarmContext } from "./context.js";
import { loadEnvFile } from "./env.js";
import type { AgentResult, PhaseResult, SwarmConfig, SwarmResult } from "./types.js";

const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-sonnet-4-5-20241022": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5-20251001": { input: 0.80, output: 4.0 },
  "claude-opus-4-8": { input: 15.0, output: 75.0 },
};

function estimateCost(
  tokens: { input: number; output: number },
  model: string = "claude-sonnet-4-6",
): { input: number; output: number; total: number } {
  const rates = MODEL_COSTS[model] ?? MODEL_COSTS["claude-sonnet-4-6"];
  const inputCost = (tokens.input / 1_000_000) * rates.input;
  const outputCost = (tokens.output / 1_000_000) * rates.output;
  return { input: inputCost, output: outputCost, total: inputCost + outputCost };
}

async function runWithConcurrencyLimit<T>(
  tasks: (() => Promise<T>)[],
  maxConcurrency: number,
): Promise<PromiseSettledResult<T>[]> {
  if (maxConcurrency >= tasks.length) {
    return Promise.allSettled(tasks.map((t) => t()));
  }

  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let nextIndex = 0;

  async function runNext(): Promise<void> {
    while (nextIndex < tasks.length) {
      const index = nextIndex++;
      try {
        const value = await tasks[index]();
        results[index] = { status: "fulfilled", value };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(maxConcurrency, tasks.length) },
    () => runNext(),
  );
  await Promise.all(workers);
  return results;
}

export class Swarm {
  private config: SwarmConfig;
  private client?: Anthropic;

  constructor(config: SwarmConfig) {
    this.config = config;
  }

  async run(input: string): Promise<SwarmResult> {
    loadEnvFile();

    if (!process.env["ANTHROPIC_API_KEY"]) {
      throw new Error(
        "ANTHROPIC_API_KEY environment variable is required. Set it or create a .env file.",
      );
    }
    this.client = new Anthropic();
    const swarmStart = Date.now();
    const context = new SwarmContext(input);
    const maxRetries = this.config.maxRetries ?? 1;
    const continueOnFailure = this.config.continueOnAgentFailure ?? false;
    const phaseResults: PhaseResult[] = [];

    console.log(`\n🐝 Swarm "${this.config.name}" activated`);
    console.log(`   ${this.config.description}`);
    console.log(`   Input: ${input.slice(0, 100)}${input.length > 100 ? "..." : ""}`);
    console.log(`   Phases: ${this.config.phases.length} | Agents: ${this.config.phases.reduce((sum, p) => sum + p.agents.length, 0)}\n`);

    for (const phase of this.config.phases) {
      const phaseStart = Date.now();
      const agentCount = phase.agents.length;

      console.log(`   ┌─ Phase: ${phase.name} (${agentCount} agent${agentCount > 1 ? "s" : ""}${agentCount > 1 ? " in parallel" : ""})`);
      this.config.onPhaseStart?.(phase.name);

      const maxConcurrency = phase.maxConcurrency ?? agentCount;

      const agentTasks = phase.agents.map((agentConfig) => () =>
        this.runAgent(agentConfig.name, new Agent(this.client!, agentConfig, phase.name), context, maxRetries),
      );

      const settled = await runWithConcurrencyLimit(agentTasks, maxConcurrency);
      const results: AgentResult[] = [];

      for (let i = 0; i < settled.length; i++) {
        const outcome = settled[i];
        const agentName = phase.agents[i].name;

        if (outcome.status === "fulfilled") {
          const result = outcome.value;
          context.addResult(result);
          this.config.onAgentComplete?.(result);
          results.push(result);
        } else {
          const error = outcome.reason instanceof Error ? outcome.reason : new Error(String(outcome.reason));
          console.log(`   │  ✗ ${agentName} failed: ${error.message}`);
          this.config.onAgentError?.(agentName, error);

          const failedResult: AgentResult = {
            agentName,
            phaseName: phase.name,
            output: "",
            usage: { inputTokens: 0, outputTokens: 0 },
            durationMs: 0,
            error: error.message,
          };
          context.addResult(failedResult);
          results.push(failedResult);

          if (!continueOnFailure) {
            throw new Error(`Agent "${agentName}" failed: ${error.message}`);
          }
        }
      }

      const phaseDuration = Date.now() - phaseStart;
      const phaseResult: PhaseResult = {
        name: phase.name,
        agents: results,
        durationMs: phaseDuration,
      };
      phaseResults.push(phaseResult);
      this.config.onPhaseComplete?.(phaseResult);

      console.log(`   └─ Phase "${phase.name}" completed (${phaseDuration}ms)\n`);
    }

    const totalDurationMs = Date.now() - swarmStart;
    const totalTokens = context.totalTokens;
    const primaryModel = this.config.phases[0]?.agents[0]?.model ?? "claude-sonnet-4-6";
    const estimatedCost = estimateCost(totalTokens, primaryModel);

    console.log(`✅ Swarm "${this.config.name}" completed in ${totalDurationMs}ms`);
    console.log(`   Total tokens: ${totalTokens.input} input + ${totalTokens.output} output`);
    console.log(`   Estimated cost: $${estimatedCost.total.toFixed(4)}\n`);

    return {
      output: context.buildFinalOutput(),
      agents: context.getAllResults(),
      phases: phaseResults,
      totalDurationMs,
      totalTokens,
      estimatedCost,
    };
  }

  private async runAgent(
    name: string,
    agent: Agent,
    context: SwarmContext,
    maxRetries: number,
  ): Promise<AgentResult> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`   │  ⟳ Retrying ${name} (attempt ${attempt + 1})...`);
        }
        console.log(`   │  ▸ ${name} working...`);

        const agentInput = context.buildAgentInput(name);
        const result = await agent.run(agentInput);

        console.log(
          `   │  ✓ ${name} done (${result.durationMs}ms, ${result.usage.inputTokens}+${result.usage.outputTokens} tokens)`,
        );

        return result;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt === maxRetries) {
          throw new Error(
            `Agent "${name}" failed after ${maxRetries + 1} attempts: ${lastError.message}`,
          );
        }
      }
    }

    throw lastError!;
  }
}
