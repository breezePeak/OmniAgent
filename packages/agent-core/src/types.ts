export type AgentStatus =
  | 'idle'
  | 'planning'
  | 'running'
  | 'waiting_tool'
  | 'completed'
  | 'failed'
  | 'stopped';

export interface AgentStep {
  id: string;
  index: number;
  type: 'plan' | 'tool' | 'observe' | 'finish' | 'error';
  title: string;
  detail?: string;
  toolName?: string;
  toolArguments?: Record<string, unknown>;
  toolResult?: unknown;
  ok?: boolean;
  createdAt: number;
  finishedAt?: number;
}

export interface AgentTask {
  id: string;
  goal: string;
  status: AgentStatus;
  steps: AgentStep[];
  result?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
  providerId?: string | null;
  conversationId?: string | null;
  projectId?: string | null;
}

export interface AgentContext {
  goal: string;
  memoryContext: string;
  skillContext: string;
  toolContext: string;
  projectContext: string;
  providerId?: string | null;
  conversationId?: string | null;
  projectId?: string | null;
}

export interface PlannedAction {
  type: 'tool' | 'finish';
  title: string;
  toolName?: string;
  toolArguments?: Record<string, unknown>;
  result?: string;
}

export interface AgentDependencies {
  buildContext(goal: string, options?: { providerId?: string | null; projectId?: string | null }): Promise<AgentContext>;
  plan(goal: string, context: AgentContext, history: AgentStep[]): Promise<PlannedAction[]>;
  executeTool(call: {
    name: string;
    arguments?: Record<string, unknown>;
  }, options?: { providerId?: string | null; projectId?: string | null }): Promise<{
    ok: boolean;
    result?: unknown;
    error?: string;
  }>;
}

export interface CreateTaskInput {
  goal: string;
  providerId?: string | null;
  conversationId?: string | null;
  projectId?: string | null;
}
