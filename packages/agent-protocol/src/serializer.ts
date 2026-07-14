import type { AgentDecision } from './types.js';

export function serializeAgentDecision(decision: AgentDecision): string {
  return `<omniagent-action>\n${JSON.stringify(decision, null, 2)}\n</omniagent-action>`;
}

export function serializeToolResult(input: {
  name: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}): string {
  return `<omniagent-tool-result>\n${JSON.stringify(input, null, 2)}\n</omniagent-tool-result>`;
}
