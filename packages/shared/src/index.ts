/** Shared, platform-neutral primitives belong here. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: Error };

export type SupportedProvider = 'deepseek' | 'kimi';

export interface AdapterHealthStatus {
  contentScript: boolean;
  inputFound: boolean;
  submitFound: boolean;
  submitEnabled: boolean;
  messageCount: number;
  responseCount: number;
  checkedAt: number;
}

export interface AdapterStatus {
  provider: SupportedProvider | null;
  url: string;
  conversationId: string | null;
  health?: AdapterHealthStatus;
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
  'omni:list-session-chunks': { projectId?: string | null; limit?: number };
  'omni:search-session-chunks': { query: string; projectId?: string | null; limit?: number };
  'omni:export-data': Record<string, never>;
  'omni:import-data': { payload: string };
  'omni:list-memories': { projectId?: string | null; type?: string };
  'omni:search-memories': { query: string; limit?: number; projectId?: string | null };
  'omni:save-memory': {
    content: string;
    type?: string;
    scope?: 'global' | 'provider' | 'project';
    providerId?: SupportedProvider | null;
    projectId?: string | null;
  };
  'omni:update-memory': {
    id: string;
    content?: string;
    type?: string;
    scope?: 'global' | 'provider' | 'project';
    providerId?: SupportedProvider | null;
    projectId?: string | null;
    pinned?: boolean;
  };
  'omni:delete-memory': { id: string };
  'omni:get-memory-detail': { id: string };
  'omni:list-memory-candidates': { status?: 'pending' | 'conflict' | 'rejected' | 'expired' };
  'omni:accept-memory-candidate': { id: string; value?: string };
  'omni:reject-memory-candidate': { id: string };
  'omni:delete-conversation': { conversationId: string };
  'omni:delete-skill': { id: string };
  'omni:list-skills': Record<string, never>;
  'omni:list-skill-templates': Record<string, never>;
  'omni:install-skill-template': { id: string };
  'omni:set-skill-request-override': { skillId?: string | null; disableAll?: boolean };
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
  'omni:deduplicate-memories': Record<string, never>;
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
  'omni:switch-agent-provider': { taskId: string; providerId: SupportedProvider; conversationId?: string | null };
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
    memorySaveMode?: 'auto' | 'confirm' | 'off';
    browserControlEnabled?: boolean;
  };
  'omni:augment-prompt': { provider: SupportedProvider; prompt: string; pageSessionId?: string; conversationId?: string | null };
  'omni:stage-memory-artifact': {
    provider: SupportedProvider;
    pageSessionId: string;
    conversationId?: string | null;
    fileName: string;
    mimeType: string;
    size: number;
    contentHash: string;
    dataBase64: string;
  };
  'omni:insert-prompt': { message: string };
  'omni:send-message': { message: string };
  'omni:render-tool-status': { messageId: string; text: string };
  'omni:response-update': {
    provider: SupportedProvider;
    role: 'user' | 'assistant';
    text: string;
    messageId: string;
    conversationId: string | null;
    pageSessionId?: string;
    state?: 'partial' | 'settled';
  };
  'omni:capture-user-memory': {
    provider: SupportedProvider;
    text: string;
    conversationId?: string | null;
  };
  'omni:memory-changed': {
    content: string;
  };
}

export type ExtensionMessage<T extends keyof ExtensionMessageMap = keyof ExtensionMessageMap> = {
  type: T;
  payload?: ExtensionMessageMap[T];
  target?: 'page';
};
