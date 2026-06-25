import type { AgentResult } from "./types.js";

export class SwarmContext {
  readonly userPrompt: string;
  private results: AgentResult[] = [];
  private resultsByName: Map<string, AgentResult> = new Map();
  metadata: Record<string, unknown> = {};

  constructor(userPrompt: string) {
    this.userPrompt = userPrompt;
  }

  addResult(result: AgentResult): void {
    this.results.push(result);
    this.resultsByName.set(result.agentName, result);
  }

  getResult(agentName: string): AgentResult | undefined {
    return this.resultsByName.get(agentName);
  }

  getPhaseResults(phaseName: string): AgentResult[] {
    return this.results.filter((r) => r.phaseName === phaseName);
  }

  getAllResults(): AgentResult[] {
    return [...this.results];
  }

  get totalTokens(): { input: number; output: number } {
    return this.results.reduce(
      (acc, r) => ({
        input: acc.input + r.usage.inputTokens,
        output: acc.output + r.usage.outputTokens,
      }),
      { input: 0, output: 0 },
    );
  }

  buildAgentInput(agentName: string): string {
    const completed = this.getAllResults();
    let prompt = `Original request: ${this.userPrompt}`;

    if (completed.length > 0) {
      prompt += `\n\n=== Completed work from other agents ===\n`;
      for (const result of completed) {
        if (result.error) continue;
        prompt += `\n[${result.agentName}]:\n${result.output}\n`;
      }
    }

    prompt += `\n=== Your task ===\nYou are the ${agentName}. Using the original request${completed.length > 0 ? " and the completed work above" : ""}, complete your assigned work.`;

    return prompt;
  }

  buildFinalOutput(): string {
    const successful = this.results.filter((r) => !r.error);
    const sections = successful.map(
      (r) => `## ${r.agentName}\n\n${r.output}`,
    );
    return sections.join("\n\n---\n\n");
  }
}
