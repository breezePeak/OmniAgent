import DexieModule, { type DexieConstructor, type EntityTable } from 'dexie/dist/dexie.js';
import type { SupportedProvider } from '@omni-agent/shared';

// Dexie ships a CommonJS-compatible runtime wrapper while exposing ESM typings.
// Keep the constructor typed without relying on the unavailable named runtime export.
const Dexie = DexieModule as unknown as DexieConstructor;

function createId(): string {
  const webCrypto = globalThis.crypto as Crypto | undefined;
  if (webCrypto?.randomUUID) return webCrypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

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
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
  lastAccessedAt: number | null;
}

export type MemoryFactStatus = 'active' | 'archived' | 'deleted';
export type MemoryCandidateStatus = 'pending' | 'conflict' | 'rejected' | 'expired';
export type MemorySourceKind = 'manual' | 'user_message' | 'model_tool' | 'assistant_reply' | 'migration';
export type MemorySensitivity = 'normal' | 'personal' | 'secret';
export type MemoryInjectionPolicy = 'always' | 'relevant' | 'never';

export interface MemoryFactRecord {
  id: string;
  identityKey: string;
  canonicalKey: string;
  type: MemoryType;
  scope: MemoryScope;
  scopeKey: string;
  providerId: SupportedProvider | null;
  projectId: string | null;
  value: string;
  normalizedValue: string;
  valueHash: string;
  summary: string;
  keywords: string[];
  status: MemoryFactStatus;
  sensitivity: MemorySensitivity;
  injectionPolicy: MemoryInjectionPolicy;
  importance: number;
  confidence: number;
  pinned: boolean;
  sourceCount: number;
  accessCount: number;
  createdAt: number;
  updatedAt: number;
  lastAccessedAt: number | null;
  archivedAt: number | null;
  deletedAt: number | null;
}

export interface MemoryCandidateRecord {
  id: string;
  dedupeKey: string;
  identityKey: string;
  canonicalKey: string;
  type: MemoryType;
  scope: MemoryScope;
  providerId: SupportedProvider | null;
  projectId: string | null;
  proposedValue: string;
  normalizedValue: string;
  valueHash: string;
  summary: string;
  importance: number;
  confidence: number;
  sensitivity: MemorySensitivity;
  sourceKind: MemorySourceKind;
  sourceMessageId: string | null;
  reason: string | null;
  status: MemoryCandidateStatus;
  resolvedFactId: string | null;
  createdAt: number;
  updatedAt: number;
  expiresAt: number | null;
}

export interface MemoryEvidenceRecord {
  id: string;
  factId: string;
  sourceKind: MemorySourceKind;
  sourceMessageId: string | null;
  excerpt: string;
  valueHash: string;
  createdAt: number;
}

export interface MemoryRevisionRecord {
  id: string;
  factId: string;
  previousValue: string;
  nextValue: string;
  reason: string | null;
  sourceKind: MemorySourceKind;
  createdAt: number;
}

export interface MemoryMigrationStateRecord {
  key: string;
  cursor: number;
  completedAt: number | null;
  updatedAt: number;
}

export interface MemoryRecallLogRecord {
  id: string;
  query: string;
  factIds: string[];
  resultCount: number;
  createdAt: number;
}

export interface SessionChunkRecord {
  id: string;
  sourceKey: string;
  conversationId: string;
  providerId: SupportedProvider;
  projectId: string | null;
  summary: string;
  keywords: string[];
  messageIds: string[];
  startedAt: number;
  endedAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface SkillRecord {
  id: string;
  name: string;
  version: string;
  description: string;
  prompt: string;
  tools: string[];
  permissions: string[];
  triggers: string[];
  workflow: string[];
  knowledge: string[];
  enabled: boolean;
  source: 'builtin' | 'user';
  createdAt: number;
  updatedAt: number;
}

export type AgentTaskStatus =
  | 'idle'
  | 'planning'
  | 'running'
  | 'waiting_tool'
  | 'completed'
  | 'failed'
  | 'stopped';

export interface AgentTaskRecord {
  id: string;
  goal: string;
  status: AgentTaskStatus;
  steps: unknown[];
  result: string | null;
  error: string | null;
  providerId: SupportedProvider | null;
  conversationId: string | null;
  projectId: string | null;
  createdAt: number;
  updatedAt: number;
}

export type ProjectStatus = 'active' | 'paused' | 'archived';

export interface ProjectRecord {
  id: string;
  name: string;
  description: string;
  context: string;
  status: ProjectStatus;
  createdAt: number;
  updatedAt: number;
}

export class OmniAgentDatabase extends Dexie {
  providers!: EntityTable<ProviderRecord, 'id'>;
  conversations!: EntityTable<ConversationRecord, 'id'>;
  messages!: EntityTable<MessageRecord, 'id'>;
  settings!: EntityTable<SettingRecord, 'key'>;
  memories!: EntityTable<MemoryRecord, 'id'>;
  skills!: EntityTable<SkillRecord, 'id'>;
  agentTasks!: EntityTable<AgentTaskRecord, 'id'>;
  projects!: EntityTable<ProjectRecord, 'id'>;
  memoryFacts!: EntityTable<MemoryFactRecord, 'id'>;
  memoryCandidates!: EntityTable<MemoryCandidateRecord, 'id'>;
  memoryEvidence!: EntityTable<MemoryEvidenceRecord, 'id'>;
  memoryRevisions!: EntityTable<MemoryRevisionRecord, 'id'>;
  memoryMigrationStates!: EntityTable<MemoryMigrationStateRecord, 'key'>;
  memoryRecallLogs!: EntityTable<MemoryRecallLogRecord, 'id'>;
  sessionChunks!: EntityTable<SessionChunkRecord, 'id'>;

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
    this.version(3).stores({
      providers: '&id, adapter, updatedAt',
      conversations: '&id, providerId, externalId, [providerId+externalId], updatedAt',
      messages: '&id, conversationId, externalId, role, [conversationId+externalId], [conversationId+createdAt], updatedAt',
      settings: '&key, updatedAt',
      memories: '&id, type, scope, providerId, projectId, *keywords, updatedAt',
      skills: '&id, name, enabled, source, updatedAt',
    });
    this.version(4).stores({
      providers: '&id, adapter, updatedAt',
      conversations: '&id, providerId, externalId, [providerId+externalId], updatedAt',
      messages: '&id, conversationId, externalId, role, [conversationId+externalId], [conversationId+createdAt], updatedAt',
      settings: '&key, updatedAt',
      memories: '&id, type, scope, providerId, projectId, *keywords, updatedAt',
      skills: '&id, name, enabled, source, updatedAt',
      agentTasks: '&id, status, updatedAt',
    });
    this.version(5).stores({
      providers: '&id, adapter, updatedAt',
      conversations: '&id, providerId, externalId, [providerId+externalId], updatedAt',
      messages: '&id, conversationId, externalId, role, [conversationId+externalId], [conversationId+createdAt], updatedAt',
      settings: '&key, updatedAt',
      memories: '&id, type, scope, providerId, projectId, *keywords, updatedAt',
      skills: '&id, name, enabled, source, updatedAt',
      agentTasks: '&id, status, projectId, updatedAt',
      projects: '&id, name, status, updatedAt',
    });
    this.version(6).stores({
      providers: '&id, adapter, updatedAt',
      conversations: '&id, providerId, externalId, [providerId+externalId], updatedAt',
      messages: '&id, conversationId, externalId, role, [conversationId+externalId], [conversationId+createdAt], updatedAt',
      settings: '&key, updatedAt',
      memories: '&id, type, scope, providerId, projectId, pinned, *keywords, updatedAt',
      skills: '&id, name, enabled, source, updatedAt',
      agentTasks: '&id, status, projectId, updatedAt',
      projects: '&id, name, status, updatedAt',
    }).upgrade(async (tx) => {
      await tx.table('memories').toCollection().modify({ pinned: false });
    });
    this.version(7).stores({
      providers: '&id, adapter, updatedAt', conversations: '&id, providerId, externalId, [providerId+externalId], updatedAt',
      messages: '&id, conversationId, externalId, role, [conversationId+externalId], [conversationId+createdAt], updatedAt', settings: '&key, updatedAt',
      memories: '&id, type, scope, providerId, projectId, pinned, *keywords, updatedAt', skills: '&id, name, enabled, source, updatedAt',
      agentTasks: '&id, status, providerId, conversationId, projectId, updatedAt', projects: '&id, name, status, updatedAt',
    }).upgrade(async (tx) => { await tx.table('agentTasks').toCollection().modify({ conversationId: null }); });
    this.version(8).stores({
      providers: '&id, adapter, updatedAt', conversations: '&id, providerId, externalId, [providerId+externalId], updatedAt',
      messages: '&id, conversationId, externalId, role, [conversationId+externalId], [conversationId+createdAt], updatedAt', settings: '&key, updatedAt',
      memories: '&id, type, scope, providerId, projectId, pinned, *keywords, updatedAt', skills: '&id, name, enabled, source, updatedAt',
      agentTasks: '&id, status, providerId, conversationId, projectId, updatedAt', projects: '&id, name, status, updatedAt',
      memoryFacts: '&id, &identityKey, canonicalKey, type, scope, scopeKey, providerId, projectId, status, pinned, *keywords, updatedAt',
      memoryCandidates: '&id, &dedupeKey, identityKey, status, sourceKind, sourceMessageId, createdAt',
      memoryEvidence: '&id, factId, sourceMessageId, createdAt', memoryRevisions: '&id, factId, createdAt',
      memoryMigrationStates: '&key, updatedAt',
    });
    this.version(9).stores({
      providers: '&id, adapter, updatedAt', conversations: '&id, providerId, externalId, [providerId+externalId], updatedAt',
      messages: '&id, conversationId, externalId, role, [conversationId+externalId], [conversationId+createdAt], updatedAt', settings: '&key, updatedAt',
      memories: '&id, type, scope, providerId, projectId, pinned, *keywords, updatedAt', skills: '&id, name, enabled, source, updatedAt',
      agentTasks: '&id, status, providerId, conversationId, projectId, updatedAt', projects: '&id, name, status, updatedAt',
      memoryFacts: '&id, &identityKey, canonicalKey, type, scope, scopeKey, providerId, projectId, status, pinned, *keywords, updatedAt',
      memoryCandidates: '&id, &dedupeKey, identityKey, status, sourceKind, sourceMessageId, createdAt',
      memoryEvidence: '&id, factId, sourceMessageId, createdAt', memoryRevisions: '&id, factId, createdAt', memoryMigrationStates: '&key, updatedAt',
      memoryRecallLogs: '&id, createdAt',
    });
    this.version(10).stores({
      providers: '&id, adapter, updatedAt', conversations: '&id, providerId, externalId, [providerId+externalId], updatedAt',
      messages: '&id, conversationId, externalId, role, [conversationId+externalId], [conversationId+createdAt], updatedAt', settings: '&key, updatedAt',
      memories: '&id, type, scope, providerId, projectId, pinned, *keywords, updatedAt', skills: '&id, name, enabled, source, updatedAt',
      agentTasks: '&id, status, providerId, conversationId, projectId, updatedAt', projects: '&id, name, status, updatedAt',
      memoryFacts: '&id, &identityKey, canonicalKey, type, scope, scopeKey, providerId, projectId, status, pinned, *keywords, updatedAt',
      memoryCandidates: '&id, &dedupeKey, identityKey, status, sourceKind, sourceMessageId, createdAt',
      memoryEvidence: '&id, factId, sourceMessageId, createdAt', memoryRevisions: '&id, factId, createdAt', memoryMigrationStates: '&key, updatedAt',
      memoryRecallLogs: '&id, createdAt', sessionChunks: '&id, &sourceKey, conversationId, providerId, projectId, endedAt, *keywords',
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
        // Only attach an unbound conversation to the active project; never reassign.
        projectId: existing.projectId ?? input.projectId ?? null,
        updatedAt: now,
      };
      await this.db.conversations.put(conversation);
      return conversation;
    }

    const conversation: ConversationRecord = {
      id: createId(),
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
      id: createId(),
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

  async listConversations(
    providerId?: SupportedProvider,
    projectId?: string | null,
  ): Promise<ConversationRecord[]> {
    const collection = providerId
      ? this.db.conversations.where('providerId').equals(providerId)
      : this.db.conversations.toCollection();
    let rows = await collection.toArray();
    if (projectId) rows = rows.filter((row) => row.projectId === projectId);
    return rows.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async updateConversationTitle(id: string, title: string): Promise<void> {
    await this.db.conversations.update(id, { title, updatedAt: Date.now() });
  }

  async deleteConversation(id: string): Promise<void> {
    await this.db.transaction('rw', this.db.conversations, this.db.messages, this.db.sessionChunks, async () => {
      await this.db.messages.where('conversationId').equals(id).delete();
      await this.db.sessionChunks.where('conversationId').equals(id).delete();
      await this.db.conversations.delete(id);
    });
  }

  async mergeConversations(sourceId: string, targetId: string): Promise<void> {
    if (sourceId === targetId) return;
    await this.db.transaction('rw', this.db.conversations, this.db.messages, this.db.sessionChunks, async () => {
      const source = await this.db.conversations.get(sourceId);
      const target = await this.db.conversations.get(targetId);
      if (!source || !target) return;
      const messages = await this.db.messages.where('conversationId').equals(sourceId).toArray();
      await this.db.messages.bulkPut(messages.map((message) => ({ ...message, conversationId: targetId, updatedAt: Date.now() })));
      const chunks = await this.db.sessionChunks.where('conversationId').equals(sourceId).toArray();
      await this.db.sessionChunks.bulkPut(chunks.map((chunk) => ({ ...chunk, conversationId: targetId, sourceKey: chunk.sourceKey.replace(sourceId, targetId), updatedAt: Date.now() })));
      await this.db.conversations.put({ ...target, title: target.title ?? source.title, projectId: target.projectId ?? source.projectId, updatedAt: Date.now() });
      await this.db.conversations.delete(sourceId);
    });
  }

  async setSetting(key: string, value: unknown): Promise<void> {
    await this.db.settings.put({ key, value, updatedAt: Date.now() });
  }

  async getSetting<T>(key: string): Promise<T | undefined> {
    return (await this.db.settings.get(key))?.value as T | undefined;
  }

  async saveMemory(input: Omit<MemoryRecord, 'id' | 'createdAt' | 'updatedAt' | 'lastAccessedAt' | 'pinned'> & { id?: string; pinned?: boolean }): Promise<MemoryRecord> {
    const now = Date.now();
    const existing = input.id ? await this.db.memories.get(input.id) : undefined;
    const memory: MemoryRecord = {
      ...input,
      id: input.id ?? createId(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastAccessedAt: existing?.lastAccessedAt ?? null,
      pinned: input.pinned ?? existing?.pinned ?? false,
    };
    await this.db.memories.put(memory);
    return memory;
  }

  async listMemories(options: { projectId?: string | null; type?: string } = {}): Promise<MemoryRecord[]> {
    let rows = await this.db.memories.toArray();
    if (options.projectId) {
      rows = rows.filter((row) => row.projectId === options.projectId || row.scope === 'global');
    }
    if (options.type) {
      rows = rows.filter((row) => row.type === options.type);
    }
    return rows.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
  }

  async markMemoryAccessed(id: string): Promise<void> {
    await this.db.memories.update(id, { lastAccessedAt: Date.now() });
  }

  async deleteMemory(id: string): Promise<void> {
    await this.db.memories.delete(id);
  }

  async clearMemories(): Promise<number> {
    const count = (await this.db.memories.count()) + (await this.db.memoryFacts.count());
    await this.db.transaction('rw', this.db.memories, this.db.memoryFacts, this.db.memoryCandidates, this.db.memoryEvidence, this.db.memoryRevisions, async () => {
      await this.db.memories.clear();
      await this.db.memoryFacts.clear();
      await this.db.memoryCandidates.clear();
      await this.db.memoryEvidence.clear();
      await this.db.memoryRevisions.clear();
    });
    await this.db.memoryRecallLogs.clear();
    return count;
  }

  async listMemoryFacts(options: { status?: MemoryFactStatus; projectId?: string | null; type?: MemoryType } = {}): Promise<MemoryFactRecord[]> {
    let rows = await this.db.memoryFacts.toArray();
    if (options.status) rows = rows.filter((row) => row.status === options.status);
    if (options.projectId) rows = rows.filter((row) => row.scope === 'global' || row.projectId === options.projectId);
    if (options.type) rows = rows.filter((row) => row.type === options.type);
    return rows.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
  }

  async getMemoryFactByIdentity(identityKey: string): Promise<MemoryFactRecord | undefined> {
    return this.db.memoryFacts.where('identityKey').equals(identityKey).first();
  }

  async getMemoryFactDetail(id: string): Promise<{ fact: MemoryFactRecord; evidence: MemoryEvidenceRecord[]; revisions: MemoryRevisionRecord[] } | undefined> {
    const fact = await this.db.memoryFacts.get(id);
    if (!fact) return undefined;
    const [evidence, revisions] = await Promise.all([
      this.listMemoryEvidence(id),
      this.db.memoryRevisions.where('factId').equals(id).reverse().sortBy('createdAt'),
    ]);
    return { fact, evidence, revisions };
  }

  async saveMemoryFact(record: MemoryFactRecord): Promise<MemoryFactRecord> {
    await this.db.memoryFacts.put(record);
    return record;
  }

  async saveMemoryCandidate(record: MemoryCandidateRecord): Promise<MemoryCandidateRecord> {
    await this.db.memoryCandidates.put(record);
    return record;
  }

  async getMemoryCandidate(id: string): Promise<MemoryCandidateRecord | undefined> {
    return this.db.memoryCandidates.get(id);
  }

  async getMemoryCandidateByDedupeKey(dedupeKey: string): Promise<MemoryCandidateRecord | undefined> {
    return this.db.memoryCandidates.where('dedupeKey').equals(dedupeKey).first();
  }

  async listMemoryCandidates(status?: MemoryCandidateStatus): Promise<MemoryCandidateRecord[]> {
    const rows = status ? await this.db.memoryCandidates.where('status').equals(status).toArray() : await this.db.memoryCandidates.toArray();
    return rows.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async saveMemoryEvidence(record: MemoryEvidenceRecord): Promise<MemoryEvidenceRecord> {
    await this.db.memoryEvidence.put(record);
    return record;
  }

  async listMemoryEvidence(factId: string): Promise<MemoryEvidenceRecord[]> {
    return (await this.db.memoryEvidence.where('factId').equals(factId).toArray()).sort((a, b) => b.createdAt - a.createdAt);
  }

  async saveMemoryRevision(record: MemoryRevisionRecord): Promise<MemoryRevisionRecord> {
    await this.db.memoryRevisions.put(record);
    return record;
  }

  async getMemoryMigrationState(key = 'legacy-memories'): Promise<MemoryMigrationStateRecord | undefined> {
    return this.db.memoryMigrationStates.get(key);
  }

  async saveMemoryMigrationState(record: MemoryMigrationStateRecord): Promise<MemoryMigrationStateRecord> {
    await this.db.memoryMigrationStates.put(record);
    return record;
  }

  async saveMemoryRecallLog(record: MemoryRecallLogRecord): Promise<void> {
    await this.db.memoryRecallLogs.put(record);
    const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);
    await this.db.memoryRecallLogs.where('createdAt').below(cutoff).delete();
    const recent = await this.db.memoryRecallLogs.orderBy('createdAt').reverse().toArray();
    if (recent.length > 100) await this.db.memoryRecallLogs.bulkDelete(recent.slice(100).map((item) => item.id));
  }

  async listMemoryRecallLogs(limit = 100): Promise<MemoryRecallLogRecord[]> {
    return (await this.db.memoryRecallLogs.orderBy('createdAt').reverse().limit(limit).toArray());
  }

  async saveSessionChunk(input: Omit<SessionChunkRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<SessionChunkRecord> {
    const existing = await this.db.sessionChunks.where('sourceKey').equals(input.sourceKey).first();
    const now = Date.now();
    const chunk: SessionChunkRecord = { ...input, id: existing?.id ?? input.id ?? createId(), createdAt: existing?.createdAt ?? now, updatedAt: now };
    await this.db.sessionChunks.put(chunk);
    return chunk;
  }

  async listSessionChunks(options: { conversationId?: string; projectId?: string | null; limit?: number } = {}): Promise<SessionChunkRecord[]> {
    let rows = options.conversationId
      ? await this.db.sessionChunks.where('conversationId').equals(options.conversationId).toArray()
      : await this.db.sessionChunks.toArray();
    if (options.projectId) rows = rows.filter((item) => item.projectId === options.projectId);
    return rows.sort((a, b) => b.endedAt - a.endedAt).slice(0, options.limit ?? 20);
  }

  async searchSessionChunks(query: string, options: { projectId?: string | null; limit?: number } = {}): Promise<SessionChunkRecord[]> {
    const terms = sessionChunkKeywords(query);
    if (!terms.length) return [];
    const rows = await this.listSessionChunks({ projectId: options.projectId, limit: 500 });
    return rows.map((chunk) => ({ chunk, score: chunk.keywords.filter((keyword) => terms.includes(keyword)).length }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || b.chunk.endedAt - a.chunk.endedAt)
      .slice(0, options.limit ?? 20)
      .map((item) => item.chunk);
  }

  async clearConversations(): Promise<number> {
    const count = await this.db.conversations.count();
    await this.db.transaction('rw', this.db.conversations, this.db.messages, this.db.sessionChunks, async () => {
      await this.db.messages.clear();
      await this.db.sessionChunks.clear();
      await this.db.conversations.clear();
    });
    return count;
  }

  async clearAgentTasks(): Promise<number> {
    const count = await this.db.agentTasks.count();
    await this.db.agentTasks.clear();
    return count;
  }

  async listSkills(): Promise<SkillRecord[]> {
    return (await this.db.skills.toArray()).sort((a, b) => a.name.localeCompare(b.name));
  }

  async saveSkill(input: Omit<SkillRecord, 'createdAt' | 'updatedAt'> & { createdAt?: number; updatedAt?: number }): Promise<SkillRecord> {
    const now = Date.now();
    const existing = await this.db.skills.get(input.id);
    const skill: SkillRecord = {
      ...input,
      createdAt: existing?.createdAt ?? input.createdAt ?? now,
      updatedAt: now,
    };
    await this.db.skills.put(skill);
    return skill;
  }

  async deleteSkill(id: string): Promise<void> {
    await this.db.skills.delete(id);
  }

  async getSkill(id: string): Promise<SkillRecord | undefined> {
    return this.db.skills.get(id);
  }

  async listAgentTasks(): Promise<AgentTaskRecord[]> {
    return (await this.db.agentTasks.toArray()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async saveAgentTask(input: AgentTaskRecord): Promise<AgentTaskRecord> {
    const existing = await this.db.agentTasks.get(input.id);
    const task: AgentTaskRecord = {
      ...input,
      createdAt: existing?.createdAt ?? input.createdAt,
      updatedAt: Date.now(),
    };
    await this.db.agentTasks.put(task);
    return task;
  }

  async getAgentTask(id: string): Promise<AgentTaskRecord | undefined> {
    return this.db.agentTasks.get(id);
  }

  async deleteAgentTask(id: string): Promise<void> {
    await this.db.agentTasks.delete(id);
  }

  async listProjects(): Promise<ProjectRecord[]> {
    return (await this.db.projects.toArray()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async saveProject(input: Omit<ProjectRecord, 'createdAt' | 'updatedAt'> & { createdAt?: number; updatedAt?: number }): Promise<ProjectRecord> {
    const now = Date.now();
    const existing = await this.db.projects.get(input.id);
    const project: ProjectRecord = {
      ...input,
      createdAt: existing?.createdAt ?? input.createdAt ?? now,
      updatedAt: now,
    };
    await this.db.projects.put(project);
    return project;
  }

  async getProject(id: string): Promise<ProjectRecord | undefined> {
    return this.db.projects.get(id);
  }

  async deleteProject(id: string): Promise<void> {
    await this.db.projects.delete(id);
  }

  async getActiveProjectId(): Promise<string | null> {
    return (await this.getSetting<string>('active-project-id')) ?? null;
  }

  async setActiveProjectId(id: string | null): Promise<void> {
    if (!id) {
      await this.db.settings.delete('active-project-id');
      return;
    }
    await this.setSetting('active-project-id', id);
  }
}

export const storage = new OmniAgentStorage();

function sessionChunkKeywords(content: string): string[] {
  const terms = new Set(content.toLocaleLowerCase().match(/[a-z0-9_]{2,}/gu) ?? []);
  for (const group of content.match(/[\p{Script=Han}]+/gu) ?? []) {
    const chars = [...group];
    chars.forEach((char) => terms.add(char));
    for (let index = 0; index < chars.length - 1; index += 1) terms.add(`${chars[index]}${chars[index + 1]}`);
  }
  return [...terms];
}
