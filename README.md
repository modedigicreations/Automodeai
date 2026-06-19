# AutoMode AI — Swarm Agent Orchestrator

> *"Switch your business to AutoMODE — and let AI handle the rest."*

A multi-agent swarm framework powered by Claude (Anthropic API). Specialized AI agents work **in parallel phases** to complete complex tasks — from building entire websites to generating full digital courses — all from a single prompt.

Built by [Mode Digital Creations Limited](https://modewebhost.com.ng).

## Architecture

```
User Prompt
    │
    ▼
┌───────────────┐
│  Coordinator   │  (orchestrates phases)
└───────┬───────┘
        │
┌───────┼───────┐
▼       ▼       ▼       Phase 1: parallel
┌──────┐┌──────┐┌──────┐
│Agent ││Agent ││Agent │
│  A   ││  B   ││  C   │
└──┬───┘└──┬───┘└──┬───┘
   └───────┼───────┘
           ▼
   Shared Workspace         (agents deposit results)
           │
           ▼
     ┌──────────┐           Phase 2: sees Phase 1 results
     │ Agent D  │
     └────┬─────┘
          ▼
     Final Result
```

**Key concepts:**

- **Swarm** — Top-level orchestrator that coordinates execution across phases
- **Phases** — Groups of agents that run in parallel. Phases execute sequentially (Phase 2 waits for Phase 1)
- **Agents** — Specialized AI workers powered by Claude, each with a defined role and system prompt
- **Shared Workspace** — Agents in later phases see the accumulated output from all prior agents

## Available Swarms

### A-SiteGen Protocol
Autonomous Website Builder — 5 agents across 3 phases:

| Phase | Agents | Execution |
|-------|--------|-----------|
| Discovery & Design | Design Agent, Content Agent, SEO Agent | Parallel |
| Development | Dev Agent | Sequential |
| Launch Preparation | Launch Agent | Sequential |

### A-EduNet
Autonomous Course Creation Ecosystem — 5 agents across 3 phases:

| Phase | Agents | Execution |
|-------|--------|-----------|
| Curriculum Planning | Curriculum Agent | Sequential |
| Content Creation | Content Agent, Assessment Agent | Parallel |
| Packaging & Deployment | Certification Agent, LMS Agent | Parallel |

## Getting Started

### Prerequisites

- Node.js 18+
- An [Anthropic API key](https://console.anthropic.com/)

### Installation

```bash
git clone https://github.com/modedigicreations/Automodeai.git
cd Automodeai
npm install
```

### Configuration

Create a local `.env` file:

```bash
cp .env.example .env
```

Then edit `.env`:

```bash
ANTHROPIC_API_KEY=your-api-key-here
```

You can also set the key directly in your shell:

```bash
export ANTHROPIC_API_KEY=your-api-key-here
```

### Usage

```bash
# Build a website from a prompt
npx tsx src/index.ts --swarm sitegen "I run a fashion store in Lagos, I want an ecommerce site"

# Generate a full digital course
npx tsx src/index.ts --swarm edunet "Create a beginner Python programming course for secondary school students"
```

Or using npm scripts:

```bash
npm run swarm:sitegen -- "I run a fashion store in Lagos, I want an ecommerce site"
npm run swarm:edunet -- "Create a beginner Python programming course"
```

### Build

```bash
npm run build
```

## Creating Custom Swarms

Define your own multi-agent swarm by creating a `SwarmConfig`:

```typescript
import { Swarm } from "./core/swarm.js";
import type { SwarmConfig } from "./core/types.js";

const mySwarm: SwarmConfig = {
  name: "My Custom Swarm",
  description: "A custom multi-agent workflow",
  phases: [
    {
      name: "Research",
      agents: [
        { name: "Agent A", role: "You are a research specialist..." },
        { name: "Agent B", role: "You are a data analyst..." },
      ],
    },
    {
      name: "Synthesis",
      agents: [
        { name: "Agent C", role: "You synthesize findings from the research phase..." },
      ],
    },
  ],
};

const swarm = new Swarm(mySwarm);
const result = await swarm.run("Your input prompt here");
console.log(result.output);
```

### Adding Tools to Agents

```typescript
import { defineTool } from "./tools/tool.js";

const searchTool = defineTool({
  name: "web_search",
  description: "Search the web for information",
  parameters: {
    query: { type: "string", description: "Search query" },
  },
  execute: async (input) => {
    return `Results for: ${input.query}`;
  },
});

const agentWithTools = {
  name: "Research Agent",
  role: "You are a researcher with web search capabilities...",
  tools: [searchTool],
};
```

### Agent Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | string | required | Agent display name |
| `role` | string | required | System prompt defining the agent's behavior |
| `model` | string | `claude-sonnet-4-6` | Claude model to use |
| `tools` | ToolDefinition[] | `[]` | Tools the agent can call |
| `timeoutMs` | number | `120000` | Per-API-call timeout in milliseconds |
| `maxTokens` | number | `16000` | Maximum Claude output tokens for one response |
| `inputSchema` | ZodType | — | Zod schema to validate input |
| `outputSchema` | ZodType | — | Zod schema to validate output |

## Project Structure

```
src/
├── index.ts              # CLI entry point & library exports
├── core/
│   ├── agent.ts          # Agent class (Claude API wrapper with tool-use loop)
│   ├── swarm.ts          # Swarm orchestrator (parallel phase execution)
│   ├── context.ts        # SwarmContext (shared workspace between agents)
│   └── types.ts          # TypeScript interfaces
├── tools/
│   └── tool.ts           # Tool definition helper
└── examples/
    ├── sitegen.ts        # A-SiteGen swarm definition
    └── edunet.ts         # A-EduNet swarm definition
```

## Tech Stack

- **Runtime:** Node.js / TypeScript (strict mode)
- **LLM:** Claude via [@anthropic-ai/sdk](https://www.npmjs.com/package/@anthropic-ai/sdk)
- **Validation:** [Zod](https://zod.dev) for runtime schema validation
- **Default model:** `claude-sonnet-4-6` (configurable per agent)

## License

MIT
