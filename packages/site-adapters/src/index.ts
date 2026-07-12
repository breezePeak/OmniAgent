/**
 * Keeps provider-specific DOM behavior outside Agent Core.
 * Concrete adapters are deliberately deferred until after phase one.
 */
import type { SupportedProvider } from '@omni-agent/shared';
import type { ConversationTurn } from '@omni-agent/shared';

export interface ObservedMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

export interface SiteAdapter {
  id: string;
  match(url: string): boolean;
  insertPrompt(message: string): Promise<void>;
  sendMessage(message: string): Promise<void>;
  getLatestTurn(): ConversationTurn;
  observeMessages(callback: (message: ObservedMessage) => void): () => void;
  getConversationId(url?: string): string | null;
}

export interface AdapterRegistry {
  find(url: string): SiteAdapter | null;
}

export function createAdapterRegistry(adapters: readonly SiteAdapter[]): AdapterRegistry {
  return {
    find(url) {
      return adapters.find((adapter) => adapter.match(url)) ?? null;
    },
  };
}

export function providerFromAdapter(adapter: SiteAdapter | null): SupportedProvider | null {
  return adapter?.id === 'deepseek' || adapter?.id === 'kimi' ? adapter.id : null;
}

export { deepseekAdapter } from './deepseek.js';
export { kimiAdapter } from './kimi.js';
