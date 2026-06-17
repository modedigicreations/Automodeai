import type { ToolDefinition } from "../core/types.js";

export function defineTool(config: {
  name: string;
  description: string;
  parameters: Record<string, {
    type: string;
    description: string;
    enum?: string[];
  }>;
  required?: string[];
  execute: (input: Record<string, unknown>) => Promise<string>;
}): ToolDefinition {
  return {
    name: config.name,
    description: config.description,
    inputSchema: {
      type: "object",
      properties: config.parameters,
      required: config.required ?? Object.keys(config.parameters),
    },
    execute: config.execute,
  };
}
