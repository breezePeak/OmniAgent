/** Shared, platform-neutral primitives belong here. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: Error };

export type SupportedProvider = 'deepseek' | 'kimi';

export interface AdapterStatus {
  provider: SupportedProvider | null;
  url: string;
  conversationId: string | null;
}

export interface ConversationTurn {
  question: string;
  response: string;
}

export interface ExtensionMessageMap {
  'omni:adapter-status': Record<string, never>;
  'omni:conversation-snapshot': Record<string, never>;
  'omni:list-conversations': { providerId?: SupportedProvider; projectId?: string | null };
  'omni:list-messages': { conversationId: string };
  'omni:export-data': Record<string, never>;
  'omni:import-data': { payload: string };
  'omni:list-memories': { projectId?: string | null; type?: string };
  'omni:search-memories': { query: string; limit?: number; projectId?: string | null };
  'omni:save-memory': { content: string };
  'omni:delete-memory': { id: string };
  'omni:delete-conversation': { conversationId: string };
  'omni:delete-skill': { id: string };
  'omni:list-skills': Record<string, never>;
  'omni:register-skill': {
    name: string;
    description: string;
    prompt: string;
    triggers?: string[];
    tools?: string[];
    workflow?: string[];
  };
  'omni:set-skill-enabled': { id: string; enabled: boolean };
  'omni:match-skills': { query: string; limit?: number };
  'omni:list-tools': Record<string, never>;
  'omni:list-tool-history': Record<string, never>;
  'omni:clear-tool-history': Record<string, never>;
  'omni:clear-memories': Record<string, never>;
  'omni:clear-conversations': Record<string, never>;
  'omni:clear-agent-tasks': Record<string, never>;
  'omni:execute-tool': {
    name: string;
    arguments?: Record<string, unknown>;
    providerId?: SupportedProvider;
  };
  'omni:browser-snapshot': {
    includeText?: boolean;
    maxLength?: number;
    includeElements?: boolean;
    maxElements?: number;
  };
  'omni:browser-click': {
    ref?: string;
    selector?: string;
    text?: string;
    exact?: boolean;
  };
  'omni:browser-type': {
    ref?: string;
    selector?: string;
    text?: string;
    value: string;
    clear?: boolean;
    submit?: boolean;
  };
  'omni:browser-scroll': {
    direction?: 'up' | 'down' | 'left' | 'right';
    amount?: number;
    selector?: string;
  };
  'omni:browser-navigate': {
    url: string;
  };
  'omni:list-mcp-servers': Record<string, never>;
  'omni:list-agent-tasks': Record<string, never>;
  'omni:get-agent-task': { taskId: string };
  'omni:create-agent-task': {
    goal: string;
    providerId?: SupportedProvider;
  };
  'omni:run-agent-task': { taskId: string };
  'omni:pause-agent-task': { taskId: string };
  'omni:resume-agent-task': { taskId: string };
  'omni:delete-agent-task': { taskId: string };
  'omni:list-projects': Record<string, never>;
  'omni:save-project': {
    id?: string;
    name: string;
    description?: string;
    context?: string;
    status?: 'active' | 'paused' | 'archived';
  };
  'omni:delete-project': { id: string };
  'omni:set-active-project': { id: string | null };
  'omni:get-active-project': Record<string, never>;
  'omni:get-settings': Record<string, never>;
  'omni:update-settings': {
    injectMemory?: boolean;
    injectSkills?: boolean;
    injectTools?: boolean;
    injectProject?: boolean;
  };
  'omni:augment-prompt': { provider: SupportedProvider; prompt: string };
  'omni:insert-prompt': { message: string };
  'omni:send-message': { message: string };
  'omni:response-update': {
    provider: SupportedProvider;
    role: 'user' | 'assistant';
    text: string;
    messageId: string;
    conversationId: string | null;
  };
}

export type ExtensionMessage<T extends keyof ExtensionMessageMap = keyof ExtensionMessageMap> = {
  type: T;
  payload?: ExtensionMessageMap[T];
};
