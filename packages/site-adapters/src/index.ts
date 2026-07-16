/**
 * Keeps provider-specific DOM behavior outside Agent Core.
 * Concrete adapters are deliberately deferred until after phase one.
 */
import type { AdapterHealthStatus, SupportedProvider } from '@omni-agent/shared';
import type { ConversationTurn } from '@omni-agent/shared';

export interface ObservedMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

/** A settled assistant reply that is safe to hand to the Agent protocol parser. */
export interface ModelResponse {
  id: string;
  text: string;
  conversationId: string | null;
  receivedAt: number;
}

export interface ProviderCapabilities {
  nativeWebSearch: boolean;
  nativeUrlRead: boolean;
  nativeFileAnalysis: boolean;
  nativeImageAnalysis: boolean;
  nativeToolLoop: boolean;
  browserDomControl: boolean;
}

const WEB_MODEL_CAPABILITIES: ProviderCapabilities = {
  nativeWebSearch: true,
  nativeUrlRead: true,
  nativeFileAnalysis: true,
  nativeImageAnalysis: true,
  nativeToolLoop: false,
  browserDomControl: false,
};

export function getProviderCapabilities(providerId: string | null | undefined): ProviderCapabilities {
  if (providerId === 'deepseek' || providerId === 'kimi') return { ...WEB_MODEL_CAPABILITIES };
  return {
    nativeWebSearch: false,
    nativeUrlRead: false,
    nativeFileAnalysis: false,
    nativeImageAnalysis: false,
    nativeToolLoop: false,
    browserDomControl: false,
  };
}

export interface SiteAdapter {
  id: string;
  match(url: string): boolean;
  insertPrompt(message: string): Promise<void>;
  sendMessage(message: string): Promise<void>;
  inspectHealth(): AdapterHealthStatus;
  hideInternalProtocolMessages(): void;
  renderToolStatus(messageId: string, text: string): boolean;
  getLatestTurn(): ConversationTurn;
  observeMessages(callback: (message: ObservedMessage) => void): () => void;
  observeResponse(callback: (response: ModelResponse) => void): () => void;
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
export { ResponseObserver } from './response-observer.js';
