import { defineStore } from 'pinia';
import type { AdapterStatus, ConversationTurn, ExtensionMessage, ExtensionMessageMap } from '@omni-agent/shared';
import type { ConversationRecord, MemoryArtifactRecord, MemoryEvidenceRecord, MemoryCandidateRecord, MemoryFactRecord, MemoryRecord, MemoryRevisionRecord, MessageRecord, ProjectRecord, SessionChunkRecord } from '@omni-agent/storage';
import type { SkillDefinition, SkillInput } from '@omni-agent/skills';
import type { ToolDescriptor, ToolResult } from '@omni-agent/tools';
import type { AgentTask } from '@omni-agent/agent-core';
import { unwrapAdapterCommandResult, type AdapterCommandResult } from '../adapter-command';

interface McpServerSummary {
  id: string;
  name: string;
  kind: string;
  enabled: boolean;
  toolCount: number;
  tools: string[];
  connectedAt: number;
}

interface MemoryInjectionDiagnostic {
  stage: string;
  detail: string;
  count: number;
  at: number;
  provider?: 'deepseek' | 'kimi';
  items?: Array<{
    id: string;
    summary: string;
    scope: string;
    score: number;
    reason: string;
  }>;
}

interface RuntimeSettings {
  injectMemory: boolean;
  injectSkills: boolean;
  injectTools: boolean;
  injectProject: boolean;
  memorySaveMode: 'auto' | 'confirm' | 'off';
  browserControlEnabled: boolean;
}

const unsupported: AdapterStatus = {
  provider: null,
  url: '',
  conversationId: null,
};

let adapterEventsStarted = false;

export const useExtensionStore = defineStore('extension', {
  state: () => ({
    ready: true,
    adapter: unsupported,
    refreshError: '',
    prompt: '',
    inserting: false,
    insertError: '',
    latestResponse: '',
    latestQuestion: '',
    conversationError: '',
    savedConversations: [] as ConversationRecord[],
    selectedConversationId: '',
    conversationProviderFilter: '' as '' | 'deepseek' | 'kimi',
    conversationProjectOnly: false,
    savedMessages: [] as MessageRecord[],
    storageLoading: false,
    backupJson: '',
    backupLoading: false,
    backupError: '',
    backupMessage: '',
    memories: [] as MemoryRecord[],
    memoryTotalCount: 0,
    memoryDraft: '',
    memoryScopeDraft: 'global' as 'global' | 'provider' | 'project',
    memoryTypeDraft: 'knowledge' as MemoryRecord['type'],
    memoryEditId: '',
    memoryEditContent: '',
    memoryQuery: '',
    memoryTypeFilter: '' as '' | MemoryRecord['type'],
    memoryProjectOnly: false,
    memoryLoading: false,
    memoryError: '',
    memoryMessage: '',
    memoryNewItemId: '',
    memoryDiagnostic: null as MemoryInjectionDiagnostic | null,
    memoryCandidates: [] as MemoryCandidateRecord[],
    selectedMemoryId: '',
    memoryCandidateEdit: '',
    selectedMemoryDetail: null as { fact: MemoryFactRecord; evidence: MemoryEvidenceRecord[]; revisions: MemoryRevisionRecord[]; artifact: MemoryArtifactRecord | null } | null,
    sessionChunks: [] as SessionChunkRecord[],
    skills: [] as SkillDefinition[],
    skillTemplates: [] as SkillInput[],
    skillQuery: '',
    matchedSkills: [] as Array<{ skill: SkillDefinition; score: number }>,
    skillDraftName: '',
    skillDraftDescription: '',
    skillDraftPrompt: '',
    skillDraftTriggers: '',
    skillOverrideId: '',
    skillLoading: false,
    skillError: '',
    agentPollTimer: null as ReturnType<typeof setInterval> | null,
    tools: [] as ToolDescriptor[],
    selectedToolName: '',
    toolArgumentJson: '{\n  "query": ""\n}',
    lastToolResult: null as ToolResult | null,
    toolHistory: [] as Array<{
      id: string;
      name: string;
      ok: boolean;
      arguments?: Record<string, unknown>;
      result?: unknown;
      error?: string;
      durationMs: number;
      at: number;
    }>,
    toolLoading: false,
    toolError: '',
    mcpServers: [] as McpServerSummary[],
    mcpLoading: false,
    mcpError: '',
    agentTasks: [] as AgentTask[],
    agentTaskTotalCount: 0,
    selectedAgentTaskId: '',
    agentStatusFilter: '' as '' | AgentTask['status'],
    agentGoalDraft: '',
    agentProviderDraft: '' as '' | 'deepseek' | 'kimi',
    agentLoading: false,
    agentError: '',
    projects: [] as ProjectRecord[],
    activeProjectId: '',
    projectDraftName: '',
    projectDraftDescription: '',
    projectDraftContext: '',
    projectLoading: false,
    projectError: '',
    settings: {
      injectMemory: true,
      injectSkills: true,
      injectTools: true,
      injectProject: true,
      memorySaveMode: 'auto',
      browserControlEnabled: false,
    } as RuntimeSettings,
    settingsLoading: false,
    settingsError: '',
    listening: false,
    diagnosticPollTimer: null as ReturnType<typeof setInterval> | null,
  }),
  actions: {
    startResponseListener() {
      if (this.listening) return;
      this.listening = true;
      browser.runtime.onMessage.addListener((message: ExtensionMessage) => {
        if (message.type === 'omni:memory-changed') {
          const payload = message.payload as ExtensionMessageMap['omni:memory-changed'] | undefined;
          void this.handleAutomaticMemoryChange(payload?.content);
          return undefined;
        }
        if (message.type !== 'omni:response-update') return undefined;
        const payload = message.payload as ExtensionMessageMap['omni:response-update'] | undefined;
        if (payload?.role === 'user') this.latestQuestion = payload.text;
        if (payload?.role === 'assistant') this.latestResponse = payload.text;
        void this.refreshAdapter();
        void this.refreshMemoryDiagnostic();
        void this.refreshSavedConversations();
        return undefined;
      });
    },
    startAdapterListener() {
      if (adapterEventsStarted) return;
      adapterEventsStarted = true;
      browser.tabs.onActivated.addListener(() => {
        void this.refreshAdapter();
      });
      browser.tabs.onUpdated.addListener((_tabId, changeInfo) => {
        if (changeInfo.url || changeInfo.status === 'complete') void this.refreshAdapter();
      });
    },
    async handleAutomaticMemoryChange(content?: string) {
      await Promise.all([this.refreshMemories(), this.refreshMemoryCandidates(), this.refreshSessionChunks()]);
      const newMemory = content ? this.memories.find((memory) => memory.content === content) : undefined;
      this.memoryNewItemId = newMemory?.id ?? '';
      this.memoryMessage = newMemory ? `已自动保存：${newMemory.summary}` : '记忆已更新';
    },
    startDiagnosticPolling() {
      if (this.diagnosticPollTimer) return;
      this.diagnosticPollTimer = setInterval(() => {
        void this.refreshMemoryDiagnostic();
      }, 2_000);
    },
    stopDiagnosticPolling() {
      if (!this.diagnosticPollTimer) return;
      clearInterval(this.diagnosticPollTimer);
      this.diagnosticPollTimer = null;
    },
    async refreshAdapter() {
      try {
        const result = await browser.runtime.sendMessage<ExtensionMessage<'omni:adapter-status'>, AdapterCommandResult<AdapterStatus> | undefined>({
          type: 'omni:adapter-status',
        });
        const response = unwrapAdapterCommandResult<AdapterStatus>(result);
        this.adapter = response;
        this.refreshError = '';
        this.conversationError = '';
        if (response.provider) {
          try {
            await this.refreshConversation();
          } catch (error) {
            this.conversationError = error instanceof Error ? error.message : '读取当前问答失败';
          }
        }
      } catch (error) {
        this.adapter = unsupported;
        this.refreshError = error instanceof Error ? error.message : '无法连接当前页面';
      }
    },
    async refreshConversation() {
      const result = await browser.runtime.sendMessage<ExtensionMessage<'omni:conversation-snapshot'>, AdapterCommandResult<ConversationTurn | null> | undefined>({
        type: 'omni:conversation-snapshot',
      });
      const turn = unwrapAdapterCommandResult<ConversationTurn | null>(result);
      if (!turn) throw new Error('Content Script 未返回问答数据，请刷新 DeepSeek/Kimi 页面');
      this.latestQuestion = turn.question;
      this.latestResponse = turn.response;
      this.conversationError = '';
    },
    async insertPrompt() {
      const message = this.prompt.trim();
      if (!message || !this.adapter.provider) return;
      this.inserting = true;
      this.insertError = '';
      try {
        const result = await browser.runtime.sendMessage<ExtensionMessage<'omni:insert-prompt'>, AdapterCommandResult<AdapterStatus> | undefined>({
          type: 'omni:insert-prompt',
          payload: { message },
        });
        unwrapAdapterCommandResult<AdapterStatus>(result);
      } catch (error) {
        this.insertError = error instanceof Error ? error.message : '写入输入框失败';
      } finally {
        this.inserting = false;
      }
    },
    async refreshSavedConversations() {
      this.storageLoading = true;
      try {
        if (this.conversationProjectOnly && !this.activeProjectId) {
          this.savedConversations = [];
          this.selectedConversationId = '';
          this.savedMessages = [];
          return;
        }
        this.savedConversations = await browser.runtime.sendMessage<
          ExtensionMessage<'omni:list-conversations'>,
          ConversationRecord[]
        >({
          type: 'omni:list-conversations',
          payload: {
            providerId: this.conversationProviderFilter || undefined,
            projectId: this.conversationProjectOnly ? this.activeProjectId : undefined,
          },
        });
        if (!this.savedConversations.some((conversation) => conversation.id === this.selectedConversationId)) {
          this.selectedConversationId = this.savedConversations[0]?.id ?? '';
        }
        if (this.selectedConversationId) await this.selectConversation(this.selectedConversationId);
        else this.savedMessages = [];
      } finally {
        this.storageLoading = false;
      }
    },
    async selectConversation(conversationId: string) {
      this.selectedConversationId = conversationId;
      this.savedMessages = conversationId
        ? await browser.runtime.sendMessage<ExtensionMessage<'omni:list-messages'>, MessageRecord[]>({
          type: 'omni:list-messages',
          payload: { conversationId },
        })
        : [];
    },
    async refreshMemories() {
      this.memoryLoading = true;
      try {
        const allMemories = await browser.runtime.sendMessage<ExtensionMessage<'omni:list-memories'>, MemoryRecord[]>({
          type: 'omni:list-memories',
        });
        this.memoryTotalCount = allMemories.length;
        if (this.memoryQuery.trim()) {
          this.memories = await browser.runtime.sendMessage<
            ExtensionMessage<'omni:search-memories'>,
            MemoryRecord[]
          >({
            type: 'omni:search-memories',
            payload: {
              query: this.memoryQuery.trim(),
              projectId: this.memoryProjectOnly ? (this.activeProjectId || null) : undefined,
              limit: 30,
            },
          });
        } else {
          this.memories = await browser.runtime.sendMessage<ExtensionMessage<'omni:list-memories'>, MemoryRecord[]>({
            type: 'omni:list-memories',
            payload: {
              projectId: this.memoryProjectOnly ? (this.activeProjectId || null) : undefined,
              type: this.memoryTypeFilter || undefined,
            },
          });
        }
        this.memoryError = '';
      } catch (error) {
        this.memoryError = error instanceof Error ? error.message : '读取记忆失败';
      } finally {
        this.memoryLoading = false;
      }
    },
    async refreshMemoryCandidates() {
      try {
        this.memoryCandidates = await browser.runtime.sendMessage<ExtensionMessage<'omni:list-memory-candidates'>, MemoryCandidateRecord[]>({
          type: 'omni:list-memory-candidates',
        });
      } catch (error) {
        this.memoryError = error instanceof Error ? error.message : '读取待确认记忆失败';
      }
    },
    async refreshSessionChunks() {
      try {
        const projectId = this.memoryProjectOnly ? (this.activeProjectId || null) : undefined;
        this.sessionChunks = this.memoryQuery.trim()
          ? await browser.runtime.sendMessage<ExtensionMessage<'omni:search-session-chunks'>, SessionChunkRecord[]>({ type: 'omni:search-session-chunks', payload: { query: this.memoryQuery.trim(), projectId, limit: 6 } })
          : await browser.runtime.sendMessage<ExtensionMessage<'omni:list-session-chunks'>, SessionChunkRecord[]>({ type: 'omni:list-session-chunks', payload: { projectId, limit: 6 } });
      } catch (error) {
        this.memoryError = error instanceof Error ? error.message : '读取会话归档失败';
      }
    },
    async selectMemory(id: string) {
      this.selectedMemoryId = this.selectedMemoryId === id ? '' : id;
      this.selectedMemoryDetail = null;
      if (!this.selectedMemoryId) return;
      try {
        this.selectedMemoryDetail = await browser.runtime.sendMessage<
          ExtensionMessage<'omni:get-memory-detail'>,
          { fact: MemoryFactRecord; evidence: MemoryEvidenceRecord[]; revisions: MemoryRevisionRecord[]; artifact: MemoryArtifactRecord | null } | undefined
        >({ type: 'omni:get-memory-detail', payload: { id } }) ?? null;
      } catch (error) {
        this.memoryError = error instanceof Error ? error.message : '读取记忆详情失败';
      }
    },
    async acceptMemoryCandidate(candidate: MemoryCandidateRecord) {
      this.memoryLoading = true;
      try {
        await browser.runtime.sendMessage<ExtensionMessage<'omni:accept-memory-candidate'>>({
          type: 'omni:accept-memory-candidate',
          payload: { id: candidate.id, value: this.memoryCandidateEdit.trim() || undefined },
        });
        this.memoryCandidateEdit = '';
        this.memoryMessage = '已保存到长期记忆';
        await Promise.all([this.refreshMemories(), this.refreshMemoryCandidates()]);
      } catch (error) {
        this.memoryError = error instanceof Error ? error.message : '确认记忆失败';
      } finally {
        this.memoryLoading = false;
      }
    },
    async rejectMemoryCandidate(id: string) {
      this.memoryLoading = true;
      try {
        await browser.runtime.sendMessage<ExtensionMessage<'omni:reject-memory-candidate'>>({ type: 'omni:reject-memory-candidate', payload: { id } });
        this.memoryMessage = '已忽略该候选记忆';
        await this.refreshMemoryCandidates();
      } catch (error) {
        this.memoryError = error instanceof Error ? error.message : '忽略候选记忆失败';
      } finally {
        this.memoryLoading = false;
      }
    },
    async refreshMemoryDiagnostic() {
      this.memoryDiagnostic = await browser.runtime.sendMessage(
        { type: 'omni:get-memory-diagnostic' } as unknown as ExtensionMessage,
      ) as MemoryInjectionDiagnostic | null;
    },
    async saveMemory() {
      const content = this.memoryDraft.trim();
      if (!content) return;
      this.memoryLoading = true;
      try {
        await browser.runtime.sendMessage<ExtensionMessage<'omni:save-memory'>, MemoryRecord>({
          type: 'omni:save-memory',
          payload: {
            content,
            type: this.memoryTypeDraft,
            scope: this.memoryScopeDraft,
            providerId: this.memoryScopeDraft === 'provider' ? this.adapter.provider : null,
            projectId: this.memoryScopeDraft === 'project' ? (this.activeProjectId || null) : null,
          },
        });
        this.memoryDraft = '';
        await this.refreshMemories();
      } catch (error) {
        this.memoryError = error instanceof Error ? error.message : '保存记忆失败';
      } finally {
        this.memoryLoading = false;
      }
    },
    async deleteMemory(id: string) {
      this.memoryLoading = true;
      try {
        await browser.runtime.sendMessage<ExtensionMessage<'omni:delete-memory'>, { ok: boolean }>({
          type: 'omni:delete-memory',
          payload: { id },
        });
        await this.refreshMemories();
      } catch (error) {
        this.memoryError = error instanceof Error ? error.message : '删除记忆失败';
      } finally {
        this.memoryLoading = false;
      }
    },
    beginMemoryEdit(memory: MemoryRecord) {
      this.memoryEditId = memory.id;
      this.memoryEditContent = memory.content;
    },
    cancelMemoryEdit() {
      this.memoryEditId = '';
      this.memoryEditContent = '';
    },
    async saveMemoryEdit(memory: MemoryRecord) {
      const content = this.memoryEditContent.trim();
      if (!content) return;
      this.memoryLoading = true;
      try {
        await browser.runtime.sendMessage<ExtensionMessage<'omni:update-memory'>, MemoryRecord>({
          type: 'omni:update-memory',
          payload: { id: memory.id, content },
        });
        this.cancelMemoryEdit();
        await this.refreshMemories();
      } catch (error) {
        this.memoryError = error instanceof Error ? error.message : '更新记忆失败';
      } finally {
        this.memoryLoading = false;
      }
    },
    async toggleMemoryPinned(memory: MemoryRecord) {
      this.memoryLoading = true;
      try {
        await browser.runtime.sendMessage<ExtensionMessage<'omni:update-memory'>, MemoryRecord>({
          type: 'omni:update-memory',
          payload: { id: memory.id, pinned: !memory.pinned },
        });
        await this.refreshMemories();
      } catch (error) {
        this.memoryError = error instanceof Error ? error.message : '更新置顶状态失败';
      } finally {
        this.memoryLoading = false;
      }
    },
    async deleteSelectedConversation() {
      if (!this.selectedConversationId) return;
      this.storageLoading = true;
      try {
        await browser.runtime.sendMessage<ExtensionMessage<'omni:delete-conversation'>, { ok: boolean }>({
          type: 'omni:delete-conversation',
          payload: { conversationId: this.selectedConversationId },
        });
        this.selectedConversationId = '';
        await this.refreshSavedConversations();
      } catch (error) {
        this.conversationError = error instanceof Error ? error.message : '删除会话失败';
      } finally {
        this.storageLoading = false;
      }
    },
    async refreshSkills() {
      this.skillLoading = true;
      try {
        this.skills = await browser.runtime.sendMessage<ExtensionMessage<'omni:list-skills'>, SkillDefinition[]>({
          type: 'omni:list-skills',
        });
        if (this.skillQuery.trim()) await this.matchSkills();
        else this.matchedSkills = [];
        this.skillError = '';
      } catch (error) {
        this.skillError = error instanceof Error ? error.message : '读取 Skill 失败';
      } finally {
        this.skillLoading = false;
      }
    },
    async refreshSkillTemplates() {
      this.skillTemplates = await browser.runtime.sendMessage<
        ExtensionMessage<'omni:list-skill-templates'>,
        SkillInput[]
      >({ type: 'omni:list-skill-templates' });
    },
    async installSkillTemplate(id: string) {
      this.skillLoading = true;
      try {
        await browser.runtime.sendMessage<ExtensionMessage<'omni:install-skill-template'>, SkillDefinition>({
          type: 'omni:install-skill-template',
          payload: { id },
        });
        await this.refreshSkills();
        this.skillError = '';
      } catch (error) {
        this.skillError = error instanceof Error ? error.message : '安装 Skill 模板失败';
      } finally {
        this.skillLoading = false;
      }
    },
    async setSkillRequestOverride(skillId?: string, disableAll = false) {
      this.skillLoading = true;
      try {
        await browser.runtime.sendMessage<ExtensionMessage<'omni:set-skill-request-override'>, { ok: boolean }>({
          type: 'omni:set-skill-request-override',
          payload: { skillId: skillId || null, disableAll },
        });
        this.skillOverrideId = disableAll ? '__disabled__' : (skillId || '');
        this.skillError = disableAll ? '下一次发送将禁用所有 Skill' : '下一次发送将强制使用所选 Skill';
      } catch (error) {
        this.skillError = error instanceof Error ? error.message : '设置本次 Skill 失败';
      } finally {
        this.skillLoading = false;
      }
    },
    async matchSkills() {
      const query = this.skillQuery.trim();
      if (!query) {
        this.matchedSkills = [];
        return;
      }
      this.skillLoading = true;
      try {
        const matches = await browser.runtime.sendMessage<
          ExtensionMessage<'omni:match-skills'>,
          Array<{ skill: SkillDefinition; score: number }>
        >({
          type: 'omni:match-skills',
          payload: { query, limit: 8 },
        });
        this.matchedSkills = matches;
        this.skillError = '';
      } catch (error) {
        this.skillError = error instanceof Error ? error.message : '匹配 Skill 失败';
      } finally {
        this.skillLoading = false;
      }
    },
    async registerSkill() {
      const name = this.skillDraftName.trim();
      const prompt = this.skillDraftPrompt.trim();
      if (!name || !prompt) return;
      this.skillLoading = true;
      try {
        await browser.runtime.sendMessage<ExtensionMessage<'omni:register-skill'>, SkillDefinition>({
          type: 'omni:register-skill',
          payload: {
            name,
            description: this.skillDraftDescription.trim() || name,
            prompt,
            triggers: this.skillDraftTriggers
              .split(/[,，]/u)
              .map((item) => item.trim())
              .filter(Boolean),
          },
        });
        this.skillDraftName = '';
        this.skillDraftDescription = '';
        this.skillDraftPrompt = '';
        this.skillDraftTriggers = '';
        await this.refreshSkills();
      } catch (error) {
        this.skillError = error instanceof Error ? error.message : '注册 Skill 失败';
      } finally {
        this.skillLoading = false;
      }
    },
    async setSkillEnabled(id: string, enabled: boolean) {
      this.skillLoading = true;
      try {
        await browser.runtime.sendMessage<ExtensionMessage<'omni:set-skill-enabled'>, SkillDefinition>({
          type: 'omni:set-skill-enabled',
          payload: { id, enabled },
        });
        await this.refreshSkills();
      } catch (error) {
        this.skillError = error instanceof Error ? error.message : '更新 Skill 失败';
      } finally {
        this.skillLoading = false;
      }
    },
    async deleteSkill(id: string) {
      this.skillLoading = true;
      try {
        await browser.runtime.sendMessage<ExtensionMessage<'omni:delete-skill'>, { ok: boolean }>({
          type: 'omni:delete-skill',
          payload: { id },
        });
        await this.refreshSkills();
      } catch (error) {
        this.skillError = error instanceof Error ? error.message : '删除 Skill 失败';
      } finally {
        this.skillLoading = false;
      }
    },
    async refreshTools() {
      this.toolLoading = true;
      try {
        this.tools = await browser.runtime.sendMessage<ExtensionMessage<'omni:list-tools'>, ToolDescriptor[]>({
          type: 'omni:list-tools',
        });
        if (!this.tools.some((tool) => tool.name === this.selectedToolName)) {
          this.selectedToolName = this.tools[0]?.name ?? '';
          this.syncToolArgumentTemplate();
        }
        await this.refreshToolHistory();
        this.toolError = '';
      } catch (error) {
        this.toolError = error instanceof Error ? error.message : '读取工具失败';
      } finally {
        this.toolLoading = false;
      }
    },
    async refreshToolHistory() {
      this.toolHistory = await browser.runtime.sendMessage<
        ExtensionMessage<'omni:list-tool-history'>,
        Array<{
          id: string;
          name: string;
          ok: boolean;
          arguments?: Record<string, unknown>;
          result?: unknown;
          error?: string;
          durationMs: number;
          at: number;
        }>
      >({ type: 'omni:list-tool-history' });
    },
    async clearToolHistory() {
      this.toolLoading = true;
      try {
        await browser.runtime.sendMessage<ExtensionMessage<'omni:clear-tool-history'>, { ok: boolean }>({
          type: 'omni:clear-tool-history',
        });
        this.toolHistory = [];
        this.lastToolResult = null;
      } catch (error) {
        this.toolError = error instanceof Error ? error.message : '清空工具历史失败';
      } finally {
        this.toolLoading = false;
      }
    },
    async rerunToolHistory(item: {
      name: string;
      arguments?: Record<string, unknown>;
    }) {
      this.selectedToolName = item.name;
      this.toolArgumentJson = JSON.stringify(item.arguments ?? {}, null, 2);
      await this.executeSelectedTool();
    },
    selectTool(name: string) {
      this.selectedToolName = name;
      this.syncToolArgumentTemplate();
    },
    syncToolArgumentTemplate() {
      const tool = this.tools.find((item) => item.name === this.selectedToolName);
      if (!tool) {
        this.toolArgumentJson = '{}';
        return;
      }
      const draft: Record<string, unknown> = {};
      for (const parameter of tool.parameters) {
        if (parameter.type === 'number') draft[parameter.name] = 0;
        else if (parameter.type === 'boolean') draft[parameter.name] = true;
        else if (parameter.type === 'array') draft[parameter.name] = [];
        else if (parameter.type === 'object') draft[parameter.name] = {};
        else draft[parameter.name] = '';
      }
      this.toolArgumentJson = JSON.stringify(draft, null, 2);
    },
    async executeSelectedTool() {
      if (!this.selectedToolName) return;
      this.toolLoading = true;
      this.toolError = '';
      try {
        let args: Record<string, unknown> = {};
        const raw = this.toolArgumentJson.trim();
        if (raw) {
          args = JSON.parse(raw) as Record<string, unknown>;
        }
        this.lastToolResult = await browser.runtime.sendMessage<ExtensionMessage<'omni:execute-tool'>, ToolResult>({
          type: 'omni:execute-tool',
          payload: {
            name: this.selectedToolName,
            arguments: args,
            providerId: this.adapter.provider ?? undefined,
          },
        });
        await this.refreshToolHistory();
        if (this.selectedToolName.startsWith('memory.')) await this.refreshMemories();
      } catch (error) {
        this.toolError = error instanceof Error ? error.message : '执行工具失败';
        this.lastToolResult = null;
      } finally {
        this.toolLoading = false;
      }
    },
    async clearMemories() {
      this.memoryLoading = true;
      try {
        await browser.runtime.sendMessage<ExtensionMessage<'omni:clear-memories'>, { ok: boolean; count: number }>({
          type: 'omni:clear-memories',
        });
        this.memories = [];
        this.memoryTotalCount = 0;
      } catch (error) {
        this.memoryError = error instanceof Error ? error.message : '清空记忆失败';
      } finally {
        this.memoryLoading = false;
      }
    },
    async deduplicateMemories() {
      this.memoryLoading = true;
      try {
        const result = await browser.runtime.sendMessage<ExtensionMessage<'omni:deduplicate-memories'>, { ok: boolean; count: number }>({
          type: 'omni:deduplicate-memories',
        });
        await this.refreshMemories();
        this.memoryMessage = result.count ? `发现 ${result.count} 条旧记录需要检查，不会自动删除` : '没有发现重复记忆';
      } catch (error) {
        this.memoryMessage = '';
        this.memoryError = error instanceof Error ? error.message : '记忆去重失败';
      } finally {
        this.memoryLoading = false;
      }
    },
    async clearConversations() {
      this.storageLoading = true;
      try {
        await browser.runtime.sendMessage<ExtensionMessage<'omni:clear-conversations'>, { ok: boolean; count: number }>({
          type: 'omni:clear-conversations',
        });
        this.savedConversations = [];
        this.selectedConversationId = '';
        this.savedMessages = [];
      } catch (error) {
        this.conversationError = error instanceof Error ? error.message : '清空会话失败';
      } finally {
        this.storageLoading = false;
      }
    },
    async clearAgentTasks() {
      this.agentLoading = true;
      try {
        await browser.runtime.sendMessage<ExtensionMessage<'omni:clear-agent-tasks'>, { ok: boolean; count: number }>({
          type: 'omni:clear-agent-tasks',
        });
        this.agentTasks = [];
        this.agentTaskTotalCount = 0;
        this.selectedAgentTaskId = '';
      } catch (error) {
        this.agentError = error instanceof Error ? error.message : '清空任务失败';
      } finally {
        this.agentLoading = false;
      }
    },
    async refreshMcpServers() {
      this.mcpLoading = true;
      try {
        this.mcpServers = await browser.runtime.sendMessage<ExtensionMessage<'omni:list-mcp-servers'>, McpServerSummary[]>({
          type: 'omni:list-mcp-servers',
        });
        this.mcpError = '';
      } catch (error) {
        this.mcpError = error instanceof Error ? error.message : '读取 MCP 失败';
      } finally {
        this.mcpLoading = false;
      }
    },
    async refreshAgentTasks() {
      this.agentLoading = true;
      try {
        const tasks = await browser.runtime.sendMessage<ExtensionMessage<'omni:list-agent-tasks'>, AgentTask[]>({
          type: 'omni:list-agent-tasks',
        });
        this.agentTaskTotalCount = tasks.length;
        this.agentTasks = this.agentStatusFilter
          ? tasks.filter((task) => task.status === this.agentStatusFilter)
          : tasks;
        if (!this.agentTasks.some((task) => task.id === this.selectedAgentTaskId)) {
          this.selectedAgentTaskId = this.agentTasks[0]?.id ?? '';
        }
        this.agentError = '';
      } catch (error) {
        this.agentError = error instanceof Error ? error.message : '读取 Agent 任务失败';
      } finally {
        this.agentLoading = false;
      }
    },
    async createAndRunAgentTask() {
      const goal = this.agentGoalDraft.trim();
      if (!goal) return;
      this.agentLoading = true;
      this.agentError = '';
      try {
        const created = await browser.runtime.sendMessage<ExtensionMessage<'omni:create-agent-task'>, AgentTask>({
          type: 'omni:create-agent-task',
          payload: {
            goal,
            providerId: this.adapter.provider ?? undefined,
          },
        });
        this.selectedAgentTaskId = created.id;
        this.agentGoalDraft = '';
        this.startAgentPolling();
        const finished = await browser.runtime.sendMessage<ExtensionMessage<'omni:run-agent-task'>, AgentTask>({
          type: 'omni:run-agent-task',
          payload: { taskId: created.id },
        });
        this.selectedAgentTaskId = finished.id;
        await this.refreshAgentTasks();
        await this.refreshMemories();
        await this.refreshTools();
      } catch (error) {
        this.agentError = error instanceof Error ? error.message : '执行 Agent 任务失败';
      } finally {
        this.stopAgentPolling();
        this.agentLoading = false;
      }
    },
    startAgentPolling() {
      this.stopAgentPolling();
      this.agentPollTimer = setInterval(() => {
        void this.refreshAgentTasks();
      }, 800);
    },
    stopAgentPolling() {
      if (!this.agentPollTimer) return;
      clearInterval(this.agentPollTimer);
      this.agentPollTimer = null;
    },
    async pauseSelectedAgentTask() {
      if (!this.selectedAgentTaskId) return;
      this.agentLoading = true;
      try {
        await browser.runtime.sendMessage<ExtensionMessage<'omni:pause-agent-task'>, AgentTask>({
          type: 'omni:pause-agent-task',
          payload: { taskId: this.selectedAgentTaskId },
        });
        await this.refreshAgentTasks();
      } catch (error) {
        this.agentError = error instanceof Error ? error.message : '暂停任务失败';
      } finally {
        this.agentLoading = false;
      }
    },
    async resumeSelectedAgentTask() {
      if (!this.selectedAgentTaskId) return;
      this.agentLoading = true;
      try {
        this.startAgentPolling();
        await browser.runtime.sendMessage<ExtensionMessage<'omni:resume-agent-task'>, AgentTask>({
          type: 'omni:resume-agent-task',
          payload: { taskId: this.selectedAgentTaskId },
        });
        await this.refreshAgentTasks();
      } catch (error) {
        this.agentError = error instanceof Error ? error.message : '恢复任务失败';
      } finally {
        this.stopAgentPolling();
        this.agentLoading = false;
      }
    },
    async deleteSelectedAgentTask() {
      if (!this.selectedAgentTaskId) return;
      this.agentLoading = true;
      try {
        await browser.runtime.sendMessage<ExtensionMessage<'omni:delete-agent-task'>, { ok: boolean }>({
          type: 'omni:delete-agent-task',
          payload: { taskId: this.selectedAgentTaskId },
        });
        this.selectedAgentTaskId = '';
        await this.refreshAgentTasks();
      } catch (error) {
        this.agentError = error instanceof Error ? error.message : '删除任务失败';
      } finally {
        this.agentLoading = false;
      }
    },
    async switchSelectedAgentProvider() {
      if (!this.selectedAgentTaskId || !this.agentProviderDraft) return;
      this.agentLoading = true;
      try {
        await browser.runtime.sendMessage<ExtensionMessage<'omni:switch-agent-provider'>, AgentTask>({
          type: 'omni:switch-agent-provider',
          payload: { taskId: this.selectedAgentTaskId, providerId: this.agentProviderDraft },
        });
        await this.refreshAgentTasks();
        this.agentError = '';
      } catch (error) {
        this.agentError = error instanceof Error ? error.message : '切换 Provider 失败';
      } finally {
        this.agentLoading = false;
      }
    },
    async refreshProjects() {
      this.projectLoading = true;
      try {
        this.projects = await browser.runtime.sendMessage<ExtensionMessage<'omni:list-projects'>, ProjectRecord[]>({
          type: 'omni:list-projects',
        });
        const active = await browser.runtime.sendMessage<ExtensionMessage<'omni:get-active-project'>, ProjectRecord | null>({
          type: 'omni:get-active-project',
        });
        this.activeProjectId = active?.id ?? '';
        this.projectError = '';
      } catch (error) {
        this.projectError = error instanceof Error ? error.message : '读取项目失败';
      } finally {
        this.projectLoading = false;
      }
    },
    async saveProject() {
      const name = this.projectDraftName.trim();
      if (!name) return;
      this.projectLoading = true;
      try {
        const project = await browser.runtime.sendMessage<ExtensionMessage<'omni:save-project'>, ProjectRecord>({
          type: 'omni:save-project',
          payload: {
            name,
            description: this.projectDraftDescription.trim(),
            context: this.projectDraftContext.trim(),
            status: 'active',
          },
        });
        this.projectDraftName = '';
        this.projectDraftDescription = '';
        this.projectDraftContext = '';
        await browser.runtime.sendMessage<ExtensionMessage<'omni:set-active-project'>, { ok: boolean }>({
          type: 'omni:set-active-project',
          payload: { id: project.id },
        });
        await this.refreshProjects();
      } catch (error) {
        this.projectError = error instanceof Error ? error.message : '保存项目失败';
      } finally {
        this.projectLoading = false;
      }
    },
    async setActiveProject(id: string | null) {
      this.projectLoading = true;
      try {
        await browser.runtime.sendMessage<ExtensionMessage<'omni:set-active-project'>, { ok: boolean }>({
          type: 'omni:set-active-project',
          payload: { id },
        });
        this.activeProjectId = id ?? '';
        await this.refreshProjects();
      } catch (error) {
        this.projectError = error instanceof Error ? error.message : '切换项目失败';
      } finally {
        this.projectLoading = false;
      }
    },
    async deleteProject(id: string) {
      this.projectLoading = true;
      try {
        await browser.runtime.sendMessage<ExtensionMessage<'omni:delete-project'>, { ok: boolean }>({
          type: 'omni:delete-project',
          payload: { id },
        });
        if (this.activeProjectId === id) this.activeProjectId = '';
        await this.refreshProjects();
      } catch (error) {
        this.projectError = error instanceof Error ? error.message : '删除项目失败';
      } finally {
        this.projectLoading = false;
      }
    },
    async refreshSettings() {
      this.settingsLoading = true;
      try {
        this.settings = await browser.runtime.sendMessage<ExtensionMessage<'omni:get-settings'>, RuntimeSettings>({
          type: 'omni:get-settings',
        });
        this.settingsError = '';
      } catch (error) {
        this.settingsError = error instanceof Error ? error.message : '读取设置失败';
      } finally {
        this.settingsLoading = false;
      }
    },
    async updateSettings(patch: Partial<RuntimeSettings>) {
      this.settingsLoading = true;
      try {
        this.settings = await browser.runtime.sendMessage<ExtensionMessage<'omni:update-settings'>, RuntimeSettings>({
          type: 'omni:update-settings',
          payload: patch,
        });
        this.settingsError = '';
      } catch (error) {
        this.settingsError = error instanceof Error ? error.message : '更新设置失败';
      } finally {
        this.settingsLoading = false;
      }
    },
    async exportData() {
      this.backupLoading = true;
      this.backupError = '';
      this.backupMessage = '';
      try {
        const data = await browser.runtime.sendMessage<ExtensionMessage<'omni:export-data'>, unknown>({
          type: 'omni:export-data',
        });
        this.backupJson = JSON.stringify(data, null, 2);
        this.backupMessage = '导出成功，可复制下方 JSON';
      } catch (error) {
        this.backupError = error instanceof Error ? error.message : '导出失败';
      } finally {
        this.backupLoading = false;
      }
    },
    async copyExportJson() {
      if (!this.backupJson.trim()) {
        this.backupError = '没有可复制的导出内容';
        return;
      }
      try {
        await navigator.clipboard.writeText(this.backupJson);
        this.backupMessage = '已复制导出 JSON 到剪贴板';
        this.backupError = '';
      } catch (error) {
        this.backupError = error instanceof Error ? error.message : '复制失败';
      }
    },
    async importData() {
      if (!this.backupJson.trim()) return;
      this.backupLoading = true;
      this.backupError = '';
      this.backupMessage = '';
      try {
        const result = await browser.runtime.sendMessage<
          ExtensionMessage<'omni:import-data'>,
          {
            ok: boolean;
            importedProjects: number;
            importedMemories: number;
            importedSkills: number;
            importedConversations?: number;
            importedMessages?: number;
            importedAgentTasks?: number;
          }
        >({
          type: 'omni:import-data',
          payload: { payload: this.backupJson },
        });
        this.backupMessage = [
          `导入完成：项目 ${result.importedProjects}`,
          `记忆 ${result.importedMemories}`,
          `Skill ${result.importedSkills}`,
          `会话 ${result.importedConversations ?? 0}`,
          `消息 ${result.importedMessages ?? 0}`,
          `任务 ${result.importedAgentTasks ?? 0}`,
        ].join('，');
        await Promise.all([
          this.refreshProjects(),
          this.refreshMemories(),
          this.refreshSkills(),
          this.refreshSettings(),
          this.refreshSavedConversations(),
          this.refreshAgentTasks(),
        ]);
      } catch (error) {
        this.backupError = error instanceof Error ? error.message : '导入失败';
      } finally {
        this.backupLoading = false;
      }
    },
  },
});
