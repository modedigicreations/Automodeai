import { Swarm } from "./core/swarm.js";
import { sitegenSwarm } from "./examples/sitegen.js";
import { edunetSwarm } from "./examples/edunet.js";
import type { SwarmConfig } from "./core/types.js";

const swarms: Record<string, SwarmConfig> = {
  sitegen: sitegenSwarm,
  edunet: edunetSwarm,
};

function printUsage(): void {
  console.log(`
AutoMode AI — Swarm Agent Orchestrator
"Switch your business to AutoMODE — and let AI handle the rest."

Usage:
  npx tsx src/index.ts --swarm <name> "<prompt>"

Available swarms:
  sitegen    A-SiteGen Protocol — Autonomous Website Builder (5 agents, 3 phases)
  edunet     A-EduNet — Autonomous Course Creation Ecosystem (5 agents, 3 phases)

Examples:
  npx tsx src/index.ts --swarm sitegen "I run a fashion store in Lagos, I want an ecommerce site"
  npx tsx src/index.ts --swarm edunet "Create a beginner Python programming course for secondary school students"
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  const swarmIdx = args.indexOf("--swarm");
  if (swarmIdx === -1 || !args[swarmIdx + 1]) {
    printUsage();
    process.exit(1);
  }

  const swarmName = args[swarmIdx + 1];
  const config = swarms[swarmName];
  if (!config) {
    console.error(`Unknown swarm: "${swarmName}"`);
    console.error(`Available: ${Object.keys(swarms).join(", ")}`);
    process.exit(1);
  }

  const inputParts = args.filter((_, i) => i !== swarmIdx && i !== swarmIdx + 1);
  const input = inputParts.join(" ").trim();

  if (!input) {
    console.error("Please provide a prompt after the swarm name.");
    printUsage();
    process.exit(1);
  }

  try {
    const swarm = new Swarm(config);
    const result = await swarm.run(input);

    console.log("━".repeat(60));
    console.log("SWARM OUTPUT:");
    console.log("━".repeat(60));
    console.log(result.output);
    console.log("━".repeat(60));
    console.log(`\nPhases: ${result.phases.length}`);
    for (const phase of result.phases) {
      console.log(`  ${phase.name}: ${phase.agents.map((a) => a.agentName).join(", ")} (${phase.durationMs}ms)`);
    }
    console.log(`Total: ${result.totalDurationMs}ms | ${result.totalTokens.input}+${result.totalTokens.output} tokens`);
  } catch (err) {
    console.error(
      `\nError: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
}

main();

export { Swarm } from "./core/swarm.js";
export { Agent } from "./core/agent.js";
export { SwarmContext } from "./core/context.js";
export { defineTool } from "./tools/tool.js";
export type {
  AgentConfig,
  AgentResult,
  PhaseConfig,
  PhaseResult,
  SwarmConfig,
  SwarmResult,
  ToolDefinition,
} from "./core/types.js";
