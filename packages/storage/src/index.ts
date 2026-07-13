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
  createdAt: number;
  updatedAt: number;
  lastAccessedAt: number | null;
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
    await this.db.transaction('rw', this.db.conversations, this.db.messages, async () => {
      await this.db.messages.where('conversationId').equals(id).delete();
      await this.db.conversations.delete(id);
    });
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
      id: input.id ?? createId(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastAccessedAt: existing?.lastAccessedAt ?? null,
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
    return rows.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async markMemoryAccessed(id: string): Promise<void> {
    await this.db.memories.update(id, { lastAccessedAt: Date.now() });
  }

  async deleteMemory(id: string): Promise<void> {
    await this.db.memories.delete(id);
  }

  async clearMemories(): Promise<number> {
    const count = await this.db.memories.count();
    await this.db.memories.clear();
    return count;
  }

  async clearConversations(): Promise<number> {
    const count = await this.db.conversations.count();
    await this.db.transaction('rw', this.db.conversations, this.db.messages, async () => {
      await this.db.messages.clear();
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
