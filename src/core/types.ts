import type { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Anthropic.Tool["input_schema"];
  execute: (input: Record<string, unknown>) => Promise<string>;
}

export interface AgentConfig {
  name: string;
  role: string;
  provider?: 'anthropic' | 'deepseek';
  model?: string;
  tools?: ToolDefinition[];
  inputSchema?: z.ZodType;
  outputSchema?: z.ZodType;
  timeoutMs?: number;
  maxTokens?: number;
  deepseekApiKey?: string;
}

export interface PhaseConfig {
  name: string;
  agents: AgentConfig[];
  maxConcurrency?: number;
}

export interface Logger {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface SwarmConfig {
  name: string;
  description: string;
  phases: PhaseConfig[];
  onAgentComplete?: (result: AgentResult) => void;
  onAgentError?: (agentName: string, error: Error) => void;
  onPhaseStart?: (phaseName: string) => void;
  onPhaseComplete?: (result: PhaseResult) => void;
  maxRetries?: number;
  /** Base delay in ms before the first retry; doubles per attempt (capped at 30s). Default: 1000. */
  retryDelayMs?: number;
  continueOnAgentFailure?: boolean;
  /** Custom logger for swarm progress output. Defaults to `console`. */
  logger?: Logger;
}

export interface AgentResult {
  agentName: string;
  phaseName: string;
  output: string;
  usage: { inputTokens: number; outputTokens: number };
  durationMs: number;
  /** The Claude model that powered this agent (used for per-agent cost estimation). */
  model?: string;
  error?: string;
}

export interface PhaseResult {
  name: string;
  agents: AgentResult[];
  durationMs: number;
}

export interface SwarmResult {
  output: string;
  agents: AgentResult[];
  phases: PhaseResult[];
  totalDurationMs: number;
  totalTokens: { input: number; output: number };
  estimatedCost: { input: number; output: number; total: number };
}
