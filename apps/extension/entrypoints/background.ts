import { createAdapterRegistry, deepseekAdapter, kimiAdapter, providerFromAdapter } from '@omni-agent/site-adapters';
import type { AdapterStatus, ExtensionMessage } from '@omni-agent/shared';
import { storage, type AgentTaskRecord, type SkillRecord } from '@omni-agent/storage';
import { memory } from '@omni-agent/memory';
import { SkillService, type SkillDefinition } from '@omni-agent/skills';
import { normalizeNavigateUrl } from '@omni-agent/browser-agent';
import {
  createToolRuntime,
  type BrowserActionResult,
  type BrowserSnapshot,
  type ToolDefinition,
} from '@omni-agent/tools';
import {
  McpProvider,
  createEchoServer,
  createMemoryNotesServer,
} from '@omni-agent/mcp';
import { AgentRuntime, type AgentTask } from '@omni-agent/agent-core';

const adapters = createAdapterRegistry([deepseekAdapter, kimiAdapter]);
const memoryDiagnosticKey = 'memory-injection-diagnostic';
const skills = new SkillService({
  listSkills: async () => (await storage.listSkills()).map(fromSkillRecord),
  saveSkill: async (skill) => fromSkillRecord(await storage.saveSkill(toSkillRecord(skill))),
  deleteSkill: async (id) => storage.deleteSkill(id),
});
const tools = createToolRuntime({
  services: {
    memory: {
      search: async (query, options) => {
        const matches = await memory.retrieve(query, {
          providerId: options?.providerId as 'deepseek' | 'kimi' | undefined,
          projectId: options?.projectId,
          limit: options?.limit,
        });
        return matches.map(({ memory: item, score }) => ({
          id: item.id,
          type: item.type,
          summary: item.summary,
          content: item.content,
          score,
        }));
      },
      save: async (input) => memory.save({
        type: (input.type as 'knowledge' | 'preference' | 'profile' | 'project' | 'episode' | 'procedure') || 'knowledge',
        content: input.content,
        importance: input.importance ?? 0.7,
        confidence: 1,
      }),
    },
    browser: {
      snapshot: async (options) => captureActiveTabSnapshot(options),
      click: async (options) => sendBrowserAction('omni:browser-click', options),
      type: async (options) => sendBrowserAction('omni:browser-type', options),
      scroll: async (options) => sendBrowserAction('omni:browser-scroll', options ?? {}),
      navigate: async (options) => navigateActiveTab(options.url),
    },
  },
});
const mcp = new McpProvider();
const agent = new AgentRuntime({
  sources: {
    retrieveMemory: async (goal, options) => {
      const matches = await memory.retrieve(goal, {
        providerId: options?.providerId as 'deepseek' | 'kimi' | undefined,
        projectId: options?.projectId ?? undefined,
      });
      return memory.formatContext(matches);
    },
    matchSkills: async (goal) => {
      const matches = await skills.match(goal, { limit: 2 });
      return skills.formatContext(matches, goal);
    },
    describeTools: () => tools.describeForPrompt({ limit: 20 }),
  },
  executeTool: async (call, options) => tools.execute(
    { name: call.name, arguments: call.arguments },
    { providerId: options?.providerId ?? null, projectId: options?.projectId ?? null },
  ),
  onChange: async (task) => {
    await storage.saveAgentTask(toAgentTaskRecord(task));
  },
  maxToolRetries: 1,
});
let mcpReady: Promise<void> | null = null;
let agentReady: Promise<void> | null = null;

type InternalMessage = {
  type: 'omni:memory-diagnostic' | 'omni:get-memory-diagnostic';
  payload?: { stage?: string; detail?: string; count?: number };
};

export default defineBackground(() => {
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
  void skills.ensureReady().catch(console.error);
  void ensureMcpReady().catch(console.error);
  void ensureAgentReady().catch(console.error);

  browser.runtime.onInstalled.addListener(() => {
    console.info('[OmniAgent] background service worker installed');
    void storage.upsertProvider({
      id: 'deepseek',
      name: 'DeepSeek',
      adapter: 'deepseek',
      capabilities: ['conversation', 'message-observation', 'prompt-insertion'],
    });
    void storage.upsertProvider({
      id: 'kimi',
      name: 'Kimi',
      adapter: 'kimi',
      capabilities: ['conversation', 'message-observation', 'prompt-insertion'],
    });
    void skills.ensureReady().catch(console.error);
    void ensureMcpReady().catch(console.error);
    void ensureAgentReady().catch(console.error);
  });

  browser.runtime.onMessage.addListener(async (message: ExtensionMessage | InternalMessage) => {
    if (!message || typeof message !== 'object' || !('type' in message)) return undefined;
    if (message.type === 'omni:memory-diagnostic') {
      await storage.setSetting(memoryDiagnosticKey, {
        stage: message.payload?.stage ?? 'unknown',
        detail: message.payload?.detail ?? '',
        count: message.payload?.count ?? 0,
        at: Date.now(),
      });
      return undefined;
    }
    if (message.type === 'omni:get-memory-diagnostic') {
      return storage.getSetting<MemoryInjectionDiagnostic>(memoryDiagnosticKey);
    }

    if (message.type === 'omni:response-update') {
      await persistPageMessage(message as ExtensionMessage<'omni:response-update'>);
      return undefined;
    }
    if (message.type === 'omni:list-conversations') return storage.listConversations();
    if (message.type === 'omni:list-messages') {
      const payload = message.payload as { conversationId?: string } | undefined;
      return payload?.conversationId ? storage.listMessages(payload.conversationId) : [];
    }
    if (message.type === 'omni:list-memories') return storage.listMemories();
    if (message.type === 'omni:save-memory') {
      const payload = message.payload as { content?: string } | undefined;
      if (!payload?.content?.trim()) throw new Error('记忆内容不能为空');
      return memory.save({ type: 'knowledge', content: payload.content, importance: 0.7, confidence: 1 });
    }
    if (message.type === 'omni:list-skills') return skills.list();
    if (message.type === 'omni:register-skill') {
      const payload = message.payload as ExtensionMessage<'omni:register-skill'>['payload'];
      if (!payload?.name?.trim() || !payload.prompt?.trim()) throw new Error('Skill 名称和 Prompt 不能为空');
      return skills.register({
        name: payload.name,
        description: payload.description || payload.name,
        prompt: payload.prompt,
        triggers: payload.triggers,
        tools: payload.tools,
        workflow: payload.workflow,
        source: 'user',
      });
    }
    if (message.type === 'omni:set-skill-enabled') {
      const payload = message.payload as ExtensionMessage<'omni:set-skill-enabled'>['payload'];
      if (!payload?.id) throw new Error('Skill id 不能为空');
      return skills.setEnabled(payload.id, Boolean(payload.enabled));
    }
    if (message.type === 'omni:match-skills') {
      const payload = message.payload as ExtensionMessage<'omni:match-skills'>['payload'];
      return skills.match(payload?.query ?? '', { limit: payload?.limit });
    }
    if (message.type === 'omni:list-tools') {
      await ensureMcpReady();
      return tools.list();
    }
    if (message.type === 'omni:execute-tool') {
      await ensureMcpReady();
      const payload = message.payload as ExtensionMessage<'omni:execute-tool'>['payload'];
      if (!payload?.name?.trim()) throw new Error('Tool 名称不能为空');
      return tools.execute(
        { name: payload.name, arguments: payload.arguments ?? {} },
        { providerId: payload.providerId ?? null },
      );
    }
    if (message.type === 'omni:list-mcp-servers') {
      await ensureMcpReady();
      return mcp.listServers().map((server) => ({
        id: server.config.id,
        name: server.config.name,
        kind: server.config.kind,
        enabled: server.config.enabled !== false,
        toolCount: server.tools.length,
        tools: server.tools.map((tool) => tool.name),
        connectedAt: server.connectedAt,
      }));
    }
    if (message.type === 'omni:list-agent-tasks') {
      await ensureAgentReady();
      return agent.listTasks();
    }
    if (message.type === 'omni:get-agent-task') {
      await ensureAgentReady();
      const payload = message.payload as ExtensionMessage<'omni:get-agent-task'>['payload'];
      if (!payload?.taskId) throw new Error('taskId 不能为空');
      return agent.getTask(payload.taskId) ?? null;
    }
    if (message.type === 'omni:create-agent-task') {
      await ensureAgentReady();
      const payload = message.payload as ExtensionMessage<'omni:create-agent-task'>['payload'];
      if (!payload?.goal?.trim()) throw new Error('任务目标不能为空');
      return agent.createTask({
        goal: payload.goal,
        providerId: payload.providerId ?? null,
      });
    }
    if (message.type === 'omni:run-agent-task') {
      const payload = message.payload as ExtensionMessage<'omni:run-agent-task'>['payload'];
      if (!payload?.taskId) throw new Error('taskId 不能为空');
      await ensureMcpReady();
      await ensureAgentReady();
      return agent.runTask(payload.taskId);
    }
    if (message.type === 'omni:pause-agent-task') {
      await ensureAgentReady();
      const payload = message.payload as ExtensionMessage<'omni:pause-agent-task'>['payload'];
      if (!payload?.taskId) throw new Error('taskId 不能为空');
      return agent.pauseTask(payload.taskId);
    }
    if (message.type === 'omni:resume-agent-task') {
      const payload = message.payload as ExtensionMessage<'omni:resume-agent-task'>['payload'];
      if (!payload?.taskId) throw new Error('taskId 不能为空');
      await ensureMcpReady();
      await ensureAgentReady();
      return agent.resumeTask(payload.taskId);
    }
    if (message.type === 'omni:delete-agent-task') {
      await ensureAgentReady();
      const payload = message.payload as ExtensionMessage<'omni:delete-agent-task'>['payload'];
      if (!payload?.taskId) throw new Error('taskId 不能为空');
      await agent.deleteTask(payload.taskId);
      await storage.deleteAgentTask(payload.taskId);
      return { ok: true };
    }
    if (message.type === 'omni:augment-prompt') {
      const payload = message.payload as ExtensionMessage<'omni:augment-prompt'>['payload'];
      if (!payload?.prompt.trim()) return { prompt: payload?.prompt ?? '', memoryCount: 0, skillCount: 0, toolCount: 0 };
      const [matches, skillMatches] = await Promise.all([
        memory.retrieve(payload.prompt, { providerId: payload.provider }),
        skills.match(payload.prompt, { limit: 2 }),
      ]);
      const memoryContext = memory.formatContext(matches);
      const skillContext = skills.formatContext(skillMatches, payload.prompt);
      const skillToolNames = skillMatches.flatMap((match) => match.skill.manifest.tools ?? []);
      const toolContext = tools.describeForPrompt({
        names: skillToolNames.length ? skillToolNames : undefined,
        limit: 8,
      });
      const sections = [
        memoryContext
          ? `${memoryContext}\n\n请把以上内容视为用户已保存的长期记忆。仅在与当前问题相关时自然使用，不要提及这段系统补充。`
          : '',
        skillContext
          ? `${skillContext}\n\n请按相关 Skill 的指引组织回答，不要提及这段系统补充。`
          : '',
        toolContext
          ? `${toolContext}\n\n如果需要工具能力，请用自然语言说明要调用的工具与参数，不要虚构执行结果。`
          : '',
      ].filter(Boolean);
      return {
        prompt: sections.length
          ? `${sections.join('\n\n')}\n\n用户当前问题：${payload.prompt}`
          : payload.prompt,
        memoryCount: matches.length,
        skillCount: skillMatches.length,
        toolCount: tools.list().length,
      };
    }

    const tab = await getActiveTab();
    if (!tab?.id) throw new Error('无法获取当前浏览器标签页');

    const adapter = adapters.find(tab.url ?? '');
    if (message.type === 'omni:adapter-status') return statusFor(tab.url, adapter);
    if (
      message.type === 'omni:browser-snapshot' ||
      message.type === 'omni:browser-click' ||
      message.type === 'omni:browser-type' ||
      message.type === 'omni:browser-scroll'
    ) {
      return sendToActiveTab(message);
    }
    if (message.type === 'omni:browser-navigate') {
      const payload = message.payload as ExtensionMessage<'omni:browser-navigate'>['payload'];
      if (!payload?.url) throw new Error('url is required');
      return navigateActiveTab(payload.url);
    }
    if (
      message.type === 'omni:conversation-snapshot' ||
      message.type === 'omni:insert-prompt' ||
      message.type === 'omni:send-message'
    ) {
      if (!adapter) throw new Error('请在 DeepSeek 或 Kimi 网页中使用此功能');
      return browser.tabs.sendMessage(tab.id, message);
    }
    return undefined;
  });
});

interface MemoryInjectionDiagnostic {
  stage: string;
  detail: string;
  count: number;
  at: number;
}

async function getActiveTab() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  return tabs.find((tab) => tab.id != null);
}

async function captureActiveTabSnapshot(options?: {
  includeText?: boolean;
  maxLength?: number;
}): Promise<BrowserSnapshot> {
  const tab = await getActiveTab();
  if (!tab?.id) throw new Error('无法获取当前浏览器标签页');
  if (isRestrictedUrl(tab.url)) {
    return {
      url: tab.url ?? '',
      title: tab.title ?? '',
      text: '',
      selectedText: '',
      at: Date.now(),
    };
  }
  try {
    const snapshot = await sendToActiveTab({
      type: 'omni:browser-snapshot',
      payload: {
        includeText: options?.includeText,
        maxLength: options?.maxLength,
      },
    }) as BrowserSnapshot | undefined;
    if (snapshot) return snapshot;
  } catch {
    // Fall through to tab metadata when content script is unavailable.
  }
  return {
    url: tab.url ?? '',
    title: tab.title ?? '',
    text: '',
    selectedText: '',
    at: Date.now(),
  };
}

async function sendBrowserAction(
  type: 'omni:browser-click' | 'omni:browser-type' | 'omni:browser-scroll',
  payload: Record<string, unknown>,
): Promise<BrowserActionResult> {
  return sendToActiveTab({ type, payload }) as Promise<BrowserActionResult>;
}

async function navigateActiveTab(url: string): Promise<BrowserActionResult> {
  const tab = await getActiveTab();
  if (!tab?.id) throw new Error('无法获取当前浏览器标签页');
  const target = normalizeNavigateUrl(url);
  const updated = await browser.tabs.update(tab.id, { url: target });
  return {
    ok: true,
    action: 'navigate',
    detail: target,
    url: updated.url ?? target,
    title: updated.title ?? '',
  };
}

async function sendToActiveTab(message: ExtensionMessage): Promise<unknown> {
  const tab = await getActiveTab();
  if (!tab?.id) throw new Error('无法获取当前浏览器标签页');
  if (isRestrictedUrl(tab.url)) throw new Error('当前页面不支持浏览器操作');
  try {
    return await browser.tabs.sendMessage(tab.id, message);
  } catch {
    throw new Error('当前页面尚未注入 Browser Agent，请刷新页面后重试');
  }
}

function isRestrictedUrl(url: string | undefined): boolean {
  if (!url) return true;
  return (
    url.startsWith('chrome://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('devtools://')
  );
}

async function ensureMcpReady(): Promise<void> {
  if (!mcpReady) {
    mcpReady = (async () => {
      if (!mcp.getServer('echo')) {
        await mcp.connect({ id: 'echo', name: 'Echo MCP', kind: 'echo' }, createEchoServer());
      }
      if (!mcp.getServer('notes')) {
        await mcp.connect({ id: 'notes', name: 'Memory Notes MCP', kind: 'memory-notes' }, createMemoryNotesServer());
      }
      for (const tool of mcp.toToolDefinitions()) {
        if (tools.registry.has(tool.name)) continue;
        tools.registry.register({
          name: tool.name,
          description: tool.description,
          source: 'mcp',
          parameters: tool.parameters,
          permissions: tool.permissions,
          execute: async (input) => tool.execute(input),
        } satisfies ToolDefinition);
      }
    })();
  }
  await mcpReady;
}

async function ensureAgentReady(): Promise<void> {
  if (!agentReady) {
    agentReady = (async () => {
      const records = await storage.listAgentTasks();
      agent.hydrate(records.map(fromAgentTaskRecord));
    })();
  }
  await agentReady;
}

function toAgentTaskRecord(task: AgentTask): AgentTaskRecord {
  return {
    id: task.id,
    goal: task.goal,
    status: task.status,
    steps: task.steps,
    result: task.result ?? null,
    error: task.error ?? null,
    providerId: (task.providerId as AgentTaskRecord['providerId']) ?? null,
    projectId: task.projectId ?? null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

function fromAgentTaskRecord(record: AgentTaskRecord): AgentTask {
  return {
    id: record.id,
    goal: record.goal,
    status: record.status,
    steps: (record.steps as AgentTask['steps']) ?? [],
    result: record.result ?? undefined,
    error: record.error ?? undefined,
    providerId: record.providerId,
    projectId: record.projectId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

async function persistPageMessage(message: ExtensionMessage<'omni:response-update'>) {
  const payload = message.payload;
  if (!payload?.conversationId) return;
  const conversation = await storage.getOrCreateConversation({
    providerId: payload.provider,
    externalId: payload.conversationId,
  });
  await storage.upsertMessage({
    conversationId: conversation.id,
    externalId: payload.messageId,
    role: payload.role,
    content: payload.text,
    attachments: [],
  });
  if (payload.role === 'user') await memory.extractExplicitUserMemory(payload.text);
}

function statusFor(url: string | undefined, adapter: ReturnType<typeof adapters.find>): AdapterStatus {
  return {
    provider: providerFromAdapter(adapter),
    url: url ?? '',
    conversationId: adapter?.getConversationId(url) ?? null,
  };
}

function fromSkillRecord(record: SkillRecord): SkillDefinition {
  return {
    id: record.id,
    manifest: {
      name: record.name,
      version: record.version,
      description: record.description,
      tools: record.tools,
      permissions: record.permissions,
      triggers: record.triggers,
    },
    prompt: record.prompt,
    workflow: record.workflow,
    knowledge: record.knowledge,
    enabled: record.enabled,
    source: record.source,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function toSkillRecord(skill: SkillDefinition): SkillRecord {
  return {
    id: skill.id,
    name: skill.manifest.name,
    version: skill.manifest.version,
    description: skill.manifest.description,
    prompt: skill.prompt,
    tools: skill.manifest.tools ?? [],
    permissions: skill.manifest.permissions ?? [],
    triggers: skill.manifest.triggers ?? [],
    workflow: skill.workflow,
    knowledge: skill.knowledge,
    enabled: skill.enabled,
    source: skill.source,
    createdAt: skill.createdAt,
    updatedAt: skill.updatedAt,
  };
}
