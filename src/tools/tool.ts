import type { ToolDefinition } from "../core/types.js";

/**
 * A JSON Schema property definition supporting nested objects, arrays,
 * enums, numeric bounds, and string constraints.
 */
export type JsonSchemaProperty = {
  type: "string" | "number" | "integer" | "boolean" | "array" | "object";
  description: string;
  enum?: string[];
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  default?: unknown;
};

export function defineTool(config: {
  name: string;
  description: string;
  parameters: Record<string, JsonSchemaProperty>;
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
