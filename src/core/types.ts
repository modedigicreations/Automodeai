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
}

export interface SwarmConfig {
  name: string;
  description: string;
  phases: PhaseConfig[];
  onAgentComplete?: (result: AgentResult) => void;
  maxRetries?: number;
}

export interface AgentResult {
  agentName: string;
  phaseName: string;
  output: string;
  usage: { inputTokens: number; outputTokens: number };
  durationMs: number;
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
}
