export interface ToolCallDecision {
  type: 'tool_call';
  toolName: string;
  arguments: Record<string, unknown>;
  reason?: string;
}

export interface AskUserDecision {
  type: 'ask_user';
  message: string;
}

export interface FinishDecision {
  type: 'finish';
  result: string;
}

export type AgentDecision = ToolCallDecision | AskUserDecision | FinishDecision;

export interface ParseDecisionSuccess {
  ok: true;
  decision: AgentDecision;
  raw: string;
}

export interface ParseDecisionFailure {
  ok: false;
  error: string;
  raw: string;
}

export type ParseDecisionResult = ParseDecisionSuccess | ParseDecisionFailure;
