import Anthropic from "@anthropic-ai/sdk";
import { Agent } from "./agent.js";
import { SwarmContext } from "./context.js";
import type { AgentResult, PhaseResult, SwarmConfig, SwarmResult } from "./types.js";

export class Swarm {
  private config: SwarmConfig;
  private client: Anthropic;

  constructor(config: SwarmConfig) {
    if (!process.env["ANTHROPIC_API_KEY"]) {
      throw new Error(
        "ANTHROPIC_API_KEY environment variable is required. Set it or create a .env file.",
      );
    }
    this.config = config;
    this.client = new Anthropic();
  }

  async run(input: string): Promise<SwarmResult> {
    const swarmStart = Date.now();
    const context = new SwarmContext(input);
    const maxRetries = this.config.maxRetries ?? 1;
    const phaseResults: PhaseResult[] = [];

    console.log(`\n🐝 Swarm "${this.config.name}" activated`);
    console.log(`   ${this.config.description}`);
    console.log(`   Input: ${input.slice(0, 100)}${input.length > 100 ? "..." : ""}`);
    console.log(`   Phases: ${this.config.phases.length} | Agents: ${this.config.phases.reduce((sum, p) => sum + p.agents.length, 0)}\n`);

    for (const phase of this.config.phases) {
      const phaseStart = Date.now();
      const agentCount = phase.agents.length;

      console.log(`   ┌─ Phase: ${phase.name} (${agentCount} agent${agentCount > 1 ? "s" : ""}${agentCount > 1 ? " in parallel" : ""})`);

      const agentPromises = phase.agents.map((agentConfig) =>
        this.runAgent(agentConfig.name, new Agent(this.client, agentConfig, phase.name), context, maxRetries),
      );

      const results = await Promise.all(agentPromises);

      for (const result of results) {
        context.addResult(result);
        this.config.onAgentComplete?.(result);
      }

      const phaseDuration = Date.now() - phaseStart;
      phaseResults.push({
        name: phase.name,
        agents: results,
        durationMs: phaseDuration,
      });

      console.log(`   └─ Phase "${phase.name}" completed (${phaseDuration}ms)\n`);
    }

    const totalDurationMs = Date.now() - swarmStart;
    const totalTokens = context.totalTokens;

    console.log(`✅ Swarm "${this.config.name}" completed in ${totalDurationMs}ms`);
    console.log(`   Total tokens: ${totalTokens.input} input + ${totalTokens.output} output\n`);

    return {
      output: context.buildFinalOutput(),
      agents: context.getAllResults(),
      phases: phaseResults,
      totalDurationMs,
      totalTokens,
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
