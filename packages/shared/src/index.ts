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
  'omni:list-conversations': Record<string, never>;
  'omni:list-messages': { conversationId: string };
  'omni:list-memories': Record<string, never>;
  'omni:save-memory': { content: string };
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
