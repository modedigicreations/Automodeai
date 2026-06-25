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
  model?: string;
  tools?: ToolDefinition[];
  inputSchema?: z.ZodType;
  outputSchema?: z.ZodType;
  timeoutMs?: number;
  maxTokens?: number;
}

export interface PhaseConfig {
  name: string;
  agents: AgentConfig[];
  maxConcurrency?: number;
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
  continueOnAgentFailure?: boolean;
}

export interface AgentResult {
  agentName: string;
  phaseName: string;
  output: string;
  usage: { inputTokens: number; outputTokens: number };
  durationMs: number;
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
