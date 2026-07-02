import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Swarm } from "./core/swarm.js";
import { sitegenSwarm } from "./examples/sitegen.js";
import { edunetSwarm } from "./examples/edunet.js";
import { contentopsSwarm } from "./examples/contentops.js";
import { bizanalystSwarm } from "./examples/bizanalyst.js";
import type { Logger, SwarmConfig } from "./core/types.js";

const swarms: Record<string, SwarmConfig> = {
  sitegen: sitegenSwarm,
  edunet: edunetSwarm,
  contentops: contentopsSwarm,
  bizanalyst: bizanalystSwarm,
};

const silentLogger: Logger = {
  log: () => {},
  warn: () => {},
  error: () => {},
};

function printUsage(): void {
  console.log(`
AutoMode AI — Swarm Agent Orchestrator
"Switch your business to AutoMODE — and let AI handle the rest."

Usage:
  npx tsx src/index.ts --swarm <name> "<prompt>" [options]
  npx tsx src/index.ts --list

Options:
  --swarm <name>    The swarm to run (required unless --list is used)
  --list            List all available swarms and exit
  --output <file>   Save the swarm output (markdown) to a file
  --json            Output the full SwarmResult as JSON (suppresses progress logs)

Available swarms:
  sitegen      A-SiteGen Protocol — Autonomous Website Builder (5 agents, 3 phases)
  edunet       A-EduNet — Autonomous Course Creation Ecosystem (5 agents, 3 phases)
  contentops   A-ContentOps — Marketing Content Pipeline (5 agents, 3 phases)
  bizanalyst   A-BizAnalyst — Business Intelligence Analyst (5 agents, 3 phases)

Examples:
  npx tsx src/index.ts --swarm sitegen "I run a fashion store in Lagos, I want an ecommerce site"
  npx tsx src/index.ts --swarm edunet "Create a beginner Python programming course for secondary school students"
  npx tsx src/index.ts --swarm contentops "Launch campaign for a productivity SaaS aimed at freelancers"
  npx tsx src/index.ts --swarm bizanalyst "A subscription meal-prep delivery service in Abuja" --output analysis.md
  npx tsx src/index.ts --swarm sitegen "fashion store" --json > result.json
`);
}

function listSwarms(): void {
  console.log("\nAvailable swarms:\n");
  for (const [key, config] of Object.entries(swarms)) {
    const agentCount = config.phases.reduce((sum, p) => sum + p.agents.length, 0);
    console.log(`  ${key.padEnd(12)} ${config.name}`);
    console.log(`  ${" ".repeat(12)} ${config.description}`);
    console.log(`  ${" ".repeat(12)} ${config.phases.length} phases | ${agentCount} agents\n`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--list")) {
    listSwarms();
    return;
  }

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

  const jsonMode = args.includes("--json");
  const jsonIdx = args.indexOf("--json");

  const outputIdx = args.indexOf("--output");
  const outputFile = outputIdx !== -1 ? args[outputIdx + 1] : undefined;
  if (outputIdx !== -1 && (!outputFile || outputFile.startsWith("--"))) {
    console.error("--output requires a file path.");
    process.exit(1);
  }

  // Exclude all flag tokens (and their values) from the user prompt.
  const excluded = new Set<number>([swarmIdx, swarmIdx + 1]);
  if (jsonIdx !== -1) {
    excluded.add(jsonIdx);
  }
  if (outputIdx !== -1) {
    excluded.add(outputIdx);
    excluded.add(outputIdx + 1);
  }

  const input = args
    .filter((_, i) => !excluded.has(i))
    .join(" ")
    .trim();

  if (!input) {
    console.error("Please provide a prompt after the swarm name.");
    printUsage();
    process.exit(1);
  }

  try {
    // In --json mode, suppress progress logs so stdout is clean JSON.
    const runConfig: SwarmConfig = jsonMode ? { ...config, logger: silentLogger } : config;
    const swarm = new Swarm(runConfig);
    const result = await swarm.run(input);

    if (outputFile) {
      writeFileSync(outputFile, result.output, "utf-8");
      if (!jsonMode) {
        console.log(`Output saved to ${outputFile}`);
      }
    }

    if (jsonMode) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

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
    console.log(`Estimated cost: $${result.estimatedCost.total.toFixed(4)}`);
  } catch (err) {
    console.error(
      `\nError: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export { Swarm } from "./core/swarm.js";
export { Agent } from "./core/agent.js";
export { SwarmContext } from "./core/context.js";
export { defineTool } from "./tools/tool.js";
export type { JsonSchemaProperty } from "./tools/tool.js";
export { sitegenSwarm } from "./examples/sitegen.js";
export { edunetSwarm } from "./examples/edunet.js";
export { contentopsSwarm } from "./examples/contentops.js";
export { bizanalystSwarm } from "./examples/bizanalyst.js";
export type {
  AgentConfig,
  AgentResult,
  Logger,
  PhaseConfig,
  PhaseResult,
  SwarmConfig,
  SwarmResult,
  ToolDefinition,
} from "./core/types.js";
