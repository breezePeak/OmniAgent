import DexieModule, { type DexieConstructor, type EntityTable } from 'dexie/dist/dexie.js';
import type { SupportedProvider } from '@omni-agent/shared';

// Dexie ships a CommonJS-compatible runtime wrapper while exposing ESM typings.
// Keep the constructor typed without relying on the unavailable named runtime export.
const Dexie = DexieModule as unknown as DexieConstructor;

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';
export type MemoryType = 'profile' | 'preference' | 'project' | 'episode' | 'procedure' | 'knowledge';
export type MemoryScope = 'global' | 'provider' | 'project';

export interface ProviderRecord {
  id: SupportedProvider;
  name: string;
  adapter: string;
  capabilities: string[];
  createdAt: number;
  updatedAt: number;
}

export interface ConversationRecord {
  id: string;
  providerId: SupportedProvider;
  externalId: string;
  title: string | null;
  projectId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface MessageRecord {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  externalId: string | null;
  attachments: string[];
  createdAt: number;
  updatedAt: number;
}

export interface SettingRecord {
  key: string;
  value: unknown;
  updatedAt: number;
}

export interface MemoryRecord {
  id: string;
  type: MemoryType;
  scope: MemoryScope;
  providerId: SupportedProvider | null;
  projectId: string | null;
  content: string;
  summary: string;
  keywords: string[];
  importance: number;
  confidence: number;
  createdAt: number;
  updatedAt: number;
  lastAccessedAt: number | null;
}

export class OmniAgentDatabase extends Dexie {
  providers!: EntityTable<ProviderRecord, 'id'>;
  conversations!: EntityTable<ConversationRecord, 'id'>;
  messages!: EntityTable<MessageRecord, 'id'>;
  settings!: EntityTable<SettingRecord, 'key'>;
  memories!: EntityTable<MemoryRecord, 'id'>;

  constructor(name = 'omni-agent') {
    super(name);
    this.version(1).stores({
      providers: '&id, adapter, updatedAt',
      conversations: '&id, providerId, externalId, [providerId+externalId], updatedAt',
      messages: '&id, conversationId, externalId, role, [conversationId+externalId], [conversationId+createdAt], updatedAt',
      settings: '&key, updatedAt',
    });
    this.version(2).stores({
      providers: '&id, adapter, updatedAt',
      conversations: '&id, providerId, externalId, [providerId+externalId], updatedAt',
      messages: '&id, conversationId, externalId, role, [conversationId+externalId], [conversationId+createdAt], updatedAt',
      settings: '&key, updatedAt',
      memories: '&id, type, scope, providerId, projectId, *keywords, updatedAt',
    });
  }
}

export class OmniAgentStorage {
  constructor(readonly db = new OmniAgentDatabase()) {}

  async upsertProvider(input: Omit<ProviderRecord, 'createdAt' | 'updatedAt'>): Promise<ProviderRecord> {
    const now = Date.now();
    const existing = await this.db.providers.get(input.id);
    const provider: ProviderRecord = {
      ...input,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await this.db.providers.put(provider);
    return provider;
  }

  async getOrCreateConversation(input: {
    providerId: SupportedProvider;
    externalId: string;
    title?: string | null;
    projectId?: string | null;
  }): Promise<ConversationRecord> {
    const existing = await this.db.conversations
      .where('[providerId+externalId]')
      .equals([input.providerId, input.externalId])
      .first();
    const now = Date.now();
    if (existing) {
      const conversation = {
        ...existing,
        title: input.title ?? existing.title,
        projectId: input.projectId ?? existing.projectId,
        updatedAt: now,
      };
      await this.db.conversations.put(conversation);
      return conversation;
    }

    const conversation: ConversationRecord = {
      id: crypto.randomUUID(),
      providerId: input.providerId,
      externalId: input.externalId,
      title: input.title ?? null,
      projectId: input.projectId ?? null,
      createdAt: now,
      updatedAt: now,
    };
    await this.db.conversations.add(conversation);
    return conversation;
  }

  async appendMessage(input: Omit<MessageRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<MessageRecord> {
    const now = Date.now();
    const message: MessageRecord = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    await this.db.transaction('rw', this.db.messages, this.db.conversations, async () => {
      await this.db.messages.add(message);
      await this.db.conversations.update(message.conversationId, { updatedAt: now });
    });
    return message;
  }

  async upsertMessage(input: Omit<MessageRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<MessageRecord> {
    if (!input.externalId) return this.appendMessage(input);
    const existing = await this.db.messages
      .where('[conversationId+externalId]')
      .equals([input.conversationId, input.externalId])
      .first();
    if (!existing) return this.appendMessage(input);

    const updated: MessageRecord = { ...existing, ...input, updatedAt: Date.now() };
    await this.db.transaction('rw', this.db.messages, this.db.conversations, async () => {
      await this.db.messages.put(updated);
      await this.db.conversations.update(updated.conversationId, { updatedAt: updated.updatedAt });
    });
    return updated;
  }

  async listMessages(conversationId: string): Promise<MessageRecord[]> {
    return this.db.messages
      .where('[conversationId+createdAt]')
      .between([conversationId, Dexie.minKey], [conversationId, Dexie.maxKey])
      .toArray();
  }

  async listConversations(providerId?: SupportedProvider): Promise<ConversationRecord[]> {
    const collection = providerId
      ? this.db.conversations.where('providerId').equals(providerId)
      : this.db.conversations.toCollection();
    return (await collection.toArray()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async setSetting(key: string, value: unknown): Promise<void> {
    await this.db.settings.put({ key, value, updatedAt: Date.now() });
  }

  async getSetting<T>(key: string): Promise<T | undefined> {
    return (await this.db.settings.get(key))?.value as T | undefined;
  }

  async saveMemory(input: Omit<MemoryRecord, 'id' | 'createdAt' | 'updatedAt' | 'lastAccessedAt'> & { id?: string }): Promise<MemoryRecord> {
    const now = Date.now();
    const existing = input.id ? await this.db.memories.get(input.id) : undefined;
    const memory: MemoryRecord = {
      ...input,
      id: input.id ?? crypto.randomUUID(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastAccessedAt: existing?.lastAccessedAt ?? null,
    };
    await this.db.memories.put(memory);
    return memory;
  }

  async listMemories(): Promise<MemoryRecord[]> {
    return (await this.db.memories.toArray()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async markMemoryAccessed(id: string): Promise<void> {
    await this.db.memories.update(id, { lastAccessedAt: Date.now() });
  }
}

export const storage = new OmniAgentStorage();
