import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import readline from "node:readline";
import { Swarm } from "./core/swarm.js";
import { sitegenSwarm } from "./examples/sitegen.js";
import { edunetSwarm } from "./examples/edunet.js";
import { contentopsSwarm } from "./examples/contentops.js";
import { bizanalystSwarm } from "./examples/bizanalyst.js";
import { outreachSwarm } from "./examples/outreach.js";
import { supportopsSwarm } from "./examples/supportops.js";
import type { Logger, SwarmConfig } from "./core/types.js";

const swarms: Record<string, SwarmConfig> = {
  sitegen: sitegenSwarm,
  edunet: edunetSwarm,
  contentops: contentopsSwarm,
  bizanalyst: bizanalystSwarm,
  outreach: outreachSwarm,
  supportops: supportopsSwarm,
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
  npx tsx src/index.ts --interactive / -i
  npx tsx src/index.ts --list

Options:
  --swarm <name>        The swarm to run (required unless --list or --interactive is used)
  --list                List all available swarms and exit
  --interactive, -i     Run in interactive setup wizard mode
  --config <path>       Load a custom swarm configuration from a JSON file
  --provider <name>     Override provider for all agents (anthropic or deepseek)
  --output <file>       Save the swarm output (markdown) to a file
  --json                Output the full SwarmResult as JSON (suppresses progress logs)

Available swarms:
  sitegen      A-SiteGen Protocol — Autonomous Website Builder (5 agents, 3 phases)
  edunet       A-EduNet — Autonomous Course Creation Ecosystem (5 agents, 3 phases)
  contentops   A-ContentOps — Marketing Content Pipeline (5 agents, 3 phases)
  bizanalyst   A-BizAnalyst — Business Intelligence Analyst (5 agents, 3 phases)
  outreach     A-Outreach Protocol — Lead Generation & Outreach (4 agents, 3 phases)
  supportops   A-SupportOps — Customer Support Automation (5 agents, 3 phases)

Examples:
  npx tsx src/index.ts --interactive
  npx tsx src/index.ts --swarm sitegen "I run a fashion store in Lagos"
  npx tsx src/index.ts --swarm outreach "hospitality business in London" --provider deepseek
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

async function askInteractive(): Promise<{ swarmName: string; input: string; outputFile?: string }> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (query: string): Promise<string> => {
    return new Promise((resolve) => rl.question(query, resolve));
  };

  try {
    console.log("\nAutoMode AI Swarm Orchestrator — Interactive Setup Wizard");
    console.log("========================================================");
    console.log("Available Swarms:");
    Object.entries(swarms).forEach(([key, config]) => {
      console.log(`  - ${key.padEnd(12)}: ${config.name}`);
    });
    console.log("");

    let swarmName = "";
    while (!swarms[swarmName]) {
      swarmName = (await question("Enter Swarm name: ")).trim().toLowerCase();
      if (!swarms[swarmName]) {
        console.log(`Unknown swarm name. Choose from: ${Object.keys(swarms).join(", ")}`);
      }
    }

    let input = "";
    while (!input) {
      input = (await question("Enter your prompt / request: ")).trim();
      if (!input) {
        console.log("Prompt cannot be empty.");
      }
    }

    const output = (await question("Save output to file? (leave empty to skip): ")).trim();

    return {
      swarmName,
      input,
      outputFile: output || undefined,
    };
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--list")) {
    listSwarms();
    return;
  }

  const isInteractive = args.includes("--interactive") || args.includes("-i");
  let swarmName = "";
  let input = "";
  let outputFile: string | undefined;

  const outputIdx = args.indexOf("--output");
  if (outputIdx !== -1) {
    outputFile = args[outputIdx + 1];
    if (!outputFile || outputFile.startsWith("--")) {
      console.error("--output requires a file path.");
      process.exit(1);
    }
  }

  // Handle Dynamic JSON Configuration file loading
  const configIdx = args.indexOf("--config");
  let config: SwarmConfig | undefined;
  if (configIdx !== -1) {
    const configPath = args[configIdx + 1];
    if (!configPath || !existsSync(configPath)) {
      console.error("Please provide a valid path to a JSON configuration file.");
      process.exit(1);
    }
    try {
      config = JSON.parse(readFileSync(configPath, "utf-8"));
    } catch (err: any) {
      console.error(`Failed to parse configuration file: ${err.message}`);
      process.exit(1);
    }
  }

  if (isInteractive) {
    const answers = await askInteractive();
    swarmName = answers.swarmName;
    input = answers.input;
    if (answers.outputFile) {
      outputFile = answers.outputFile;
    }
    if (!config) {
      config = swarms[swarmName];
    }
  } else {
    const swarmIdx = args.indexOf("--swarm");
    if (swarmIdx === -1 || !args[swarmIdx + 1]) {
      if (!config) {
        printUsage();
        process.exit(1);
      }
    } else {
      swarmName = args[swarmIdx + 1];
      if (!config) {
        config = swarms[swarmName];
      }
    }

    if (!config) {
      console.error(`Unknown swarm: "${swarmName}"`);
      console.error(`Available: ${Object.keys(swarms).join(", ")}`);
      process.exit(1);
    }

    const jsonIdx = args.indexOf("--json");
    const providerIdx = args.indexOf("--provider");
    const excluded = new Set<number>([swarmIdx, swarmIdx + 1]);
    if (jsonIdx !== -1) excluded.add(jsonIdx);
    if (outputIdx !== -1) {
      excluded.add(outputIdx);
      excluded.add(outputIdx + 1);
    }
    if (configIdx !== -1) {
      excluded.add(configIdx);
      excluded.add(configIdx + 1);
    }
    if (providerIdx !== -1) {
      excluded.add(providerIdx);
      excluded.add(providerIdx + 1);
    }

    input = args
      .filter((_, i) => !excluded.has(i))
      .join(" ")
      .trim();

    if (!input) {
      console.error("Please provide a prompt after the swarm name.");
      printUsage();
      process.exit(1);
    }
  }

  // Handle Global Provider Override flag
  const providerIdx = args.indexOf("--provider");
  let providerOverride: "anthropic" | "deepseek" | undefined;
  if (providerIdx !== -1) {
    const prov = args[providerIdx + 1]?.toLowerCase();
    if (prov === "claude" || prov === "anthropic") {
      providerOverride = "anthropic";
    } else if (prov === "deepseek") {
      providerOverride = "deepseek";
    } else {
      console.error("Invalid provider override. Choose 'anthropic' or 'deepseek'.");
      process.exit(1);
    }
  }

  if (providerOverride && config) {
    // Build a new config object rather than mutating `config.phases` in
    // place — `config` here is the actual exported swarm singleton (e.g.
    // `sitegenSwarm`), shared by every caller in this process. Mutating it
    // would permanently switch that swarm to the override provider for
    // every later run in the same process, including for library
    // consumers reusing the exported config after this CLI path runs.
    config = {
      ...config,
      phases: config.phases.map((p) => ({
        ...p,
        agents: p.agents.map((a) => ({
          ...a,
          provider: providerOverride,
          model: providerOverride === "deepseek" ? "deepseek-chat" : "claude-sonnet-4-6",
        })),
      })),
    };
  }

  const jsonMode = args.includes("--json");

  try {
    const runConfig: SwarmConfig = jsonMode ? { ...config!, logger: silentLogger } : config!;
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
export { createWebsiteTools, publishWebsiteArticles, writeWebsiteFile } from "./tools/website.js";
export { createRailwayDeploymentTool, deployWebsiteToRailway } from "./tools/railway.js";
export { sitegenSwarm } from "./examples/sitegen.js";
export { edunetSwarm } from "./examples/edunet.js";
export { contentopsSwarm } from "./examples/contentops.js";
export { bizanalystSwarm } from "./examples/bizanalyst.js";
export { outreachSwarm } from "./examples/outreach.js";
export { supportopsSwarm } from "./examples/supportops.js";
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
