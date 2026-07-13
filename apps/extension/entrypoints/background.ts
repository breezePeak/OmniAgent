import { createAdapterRegistry, deepseekAdapter, kimiAdapter, providerFromAdapter } from '@omni-agent/site-adapters';
import type { AdapterStatus, ExtensionMessage } from '@omni-agent/shared';
import { storage, type AgentTaskRecord, type ProjectRecord, type SkillRecord } from '@omni-agent/storage';
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
const runtimeSettingsKey = 'runtime-settings';
const toolHistoryKey = 'tool-execution-history';
const MAX_TOOL_HISTORY = 50;

interface ToolHistoryItem {
  id: string;
  name: string;
  ok: boolean;
  arguments?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  durationMs: number;
  at: number;
}
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
    describeProject: async (projectId) => formatProjectContext(projectId),
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
    if (message.type === 'omni:list-conversations') {
      const payload = message.payload as ExtensionMessage<'omni:list-conversations'>['payload'];
      return storage.listConversations(payload?.providerId, payload?.projectId);
    }
    if (message.type === 'omni:list-messages') {
      const payload = message.payload as { conversationId?: string } | undefined;
      return payload?.conversationId ? storage.listMessages(payload.conversationId) : [];
    }
    if (message.type === 'omni:export-data') return exportWorkspaceData();
    if (message.type === 'omni:import-data') {
      const payload = message.payload as ExtensionMessage<'omni:import-data'>['payload'];
      if (!payload?.payload?.trim()) throw new Error('导入内容不能为空');
      return importWorkspaceData(payload.payload);
    }
    if (message.type === 'omni:list-memories') {
      const payload = message.payload as ExtensionMessage<'omni:list-memories'>['payload'];
      return storage.listMemories({
        projectId: payload?.projectId,
        type: payload?.type,
      });
    }
    if (message.type === 'omni:search-memories') {
      const payload = message.payload as ExtensionMessage<'omni:search-memories'>['payload'];
      if (!payload?.query?.trim()) return [];
      const activeProjectId = payload.projectId ?? await storage.getActiveProjectId();
      const matches = await memory.retrieve(payload.query, {
        projectId: activeProjectId ?? undefined,
        limit: payload.limit ?? 20,
      });
      return matches.map(({ memory: item, score }) => ({ ...item, score }));
    }
    if (message.type === 'omni:save-memory') {
      const payload = message.payload as { content?: string } | undefined;
      if (!payload?.content?.trim()) throw new Error('记忆内容不能为空');
      const activeProjectId = await storage.getActiveProjectId();
      return memory.save({
        type: 'knowledge',
        content: payload.content,
        importance: 0.7,
        confidence: 1,
        scope: activeProjectId ? 'project' : 'global',
        projectId: activeProjectId,
      });
    }
    if (message.type === 'omni:get-settings') return getRuntimeSettings();
    if (message.type === 'omni:update-settings') {
      const payload = message.payload as ExtensionMessage<'omni:update-settings'>['payload'];
      const current = await getRuntimeSettings();
      const next = {
        injectMemory: payload?.injectMemory ?? current.injectMemory,
        injectSkills: payload?.injectSkills ?? current.injectSkills,
        injectTools: payload?.injectTools ?? current.injectTools,
        injectProject: payload?.injectProject ?? current.injectProject,
      };
      await storage.setSetting(runtimeSettingsKey, next);
      return next;
    }
    if (message.type === 'omni:delete-memory') {
      const payload = message.payload as ExtensionMessage<'omni:delete-memory'>['payload'];
      if (!payload?.id) throw new Error('记忆 id 不能为空');
      await memory.delete(payload.id);
      return { ok: true };
    }
    if (message.type === 'omni:delete-conversation') {
      const payload = message.payload as ExtensionMessage<'omni:delete-conversation'>['payload'];
      if (!payload?.conversationId) throw new Error('conversationId 不能为空');
      await storage.deleteConversation(payload.conversationId);
      return { ok: true };
    }
    if (message.type === 'omni:delete-skill') {
      const payload = message.payload as ExtensionMessage<'omni:delete-skill'>['payload'];
      if (!payload?.id) throw new Error('Skill id 不能为空');
      await skills.remove(payload.id);
      return { ok: true };
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
    if (message.type === 'omni:list-tool-history') return listToolHistory();
    if (message.type === 'omni:clear-tool-history') {
      await storage.setSetting(toolHistoryKey, []);
      return { ok: true };
    }
    if (message.type === 'omni:clear-memories') {
      const count = await storage.clearMemories();
      return { ok: true, count };
    }
    if (message.type === 'omni:clear-conversations') {
      const count = await storage.clearConversations();
      return { ok: true, count };
    }
    if (message.type === 'omni:clear-agent-tasks') {
      await ensureAgentReady();
      const tasks = agent.listTasks();
      for (const task of tasks) await agent.deleteTask(task.id);
      const count = await storage.clearAgentTasks();
      agentReady = null;
      await ensureAgentReady();
      return { ok: true, count };
    }
    if (message.type === 'omni:execute-tool') {
      await ensureMcpReady();
      const payload = message.payload as ExtensionMessage<'omni:execute-tool'>['payload'];
      if (!payload?.name?.trim()) throw new Error('Tool 名称不能为空');
      const result = await tools.execute(
        { name: payload.name, arguments: payload.arguments ?? {} },
        { providerId: payload.providerId ?? null },
      );
      await appendToolHistory({
        id: crypto.randomUUID(),
        name: payload.name,
        ok: result.ok,
        arguments: payload.arguments ?? {},
        result: result.ok ? result.result : undefined,
        error: result.ok ? undefined : result.error,
        durationMs: result.durationMs,
        at: Date.now(),
      });
      return result;
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
      const activeProjectId = await storage.getActiveProjectId();
      return agent.createTask({
        goal: payload.goal,
        providerId: payload.providerId ?? null,
        projectId: activeProjectId,
      });
    }
    if (message.type === 'omni:list-projects') return storage.listProjects();
    if (message.type === 'omni:get-active-project') {
      const activeId = await storage.getActiveProjectId();
      return activeId ? (await storage.getProject(activeId)) ?? null : null;
    }
    if (message.type === 'omni:set-active-project') {
      const payload = message.payload as ExtensionMessage<'omni:set-active-project'>['payload'];
      await storage.setActiveProjectId(payload?.id ?? null);
      return { ok: true, id: payload?.id ?? null };
    }
    if (message.type === 'omni:save-project') {
      const payload = message.payload as ExtensionMessage<'omni:save-project'>['payload'];
      if (!payload?.name?.trim()) throw new Error('项目名称不能为空');
      const id = payload.id?.trim() || crypto.randomUUID();
      const existing = await storage.getProject(id);
      return storage.saveProject({
        id,
        name: payload.name.trim(),
        description: payload.description?.trim() || existing?.description || '',
        context: payload.context?.trim() || existing?.context || '',
        status: payload.status || existing?.status || 'active',
        createdAt: existing?.createdAt,
      });
    }
    if (message.type === 'omni:delete-project') {
      const payload = message.payload as ExtensionMessage<'omni:delete-project'>['payload'];
      if (!payload?.id) throw new Error('project id 不能为空');
      await storage.deleteProject(payload.id);
      const activeId = await storage.getActiveProjectId();
      if (activeId === payload.id) await storage.setActiveProjectId(null);
      return { ok: true };
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
      if (!payload?.prompt.trim()) return { prompt: payload?.prompt ?? '', memoryCount: 0, skillCount: 0, toolCount: 0, projectId: null };
      const settings = await getRuntimeSettings();
      const activeProjectId = await storage.getActiveProjectId();
      const [matches, skillMatches, projectContext] = await Promise.all([
        settings.injectMemory
          ? memory.retrieve(payload.prompt, {
            providerId: payload.provider,
            projectId: activeProjectId ?? undefined,
          })
          : Promise.resolve([]),
        settings.injectSkills ? skills.match(payload.prompt, { limit: 2 }) : Promise.resolve([]),
        settings.injectProject ? formatProjectContext(activeProjectId) : Promise.resolve(''),
      ]);
      const memoryContext = settings.injectMemory ? memory.formatContext(matches) : '';
      const skillContext = settings.injectSkills ? skills.formatContext(skillMatches, payload.prompt) : '';
      const skillToolNames = skillMatches.flatMap((match) => match.skill.manifest.tools ?? []);
      const toolContext = settings.injectTools
        ? tools.describeForPrompt({
          names: skillToolNames.length ? skillToolNames : undefined,
          limit: 8,
        })
        : '';
      const sections = [
        projectContext
          ? `${projectContext}\n\n请把以上内容视为当前项目上下文。仅在相关时自然使用，不要提及这段系统补充。`
          : '',
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
        toolCount: settings.injectTools ? tools.list().length : 0,
        projectId: activeProjectId,
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

async function formatProjectContext(projectId?: string | null): Promise<string> {
  if (!projectId) return '';
  const project = await storage.getProject(projectId);
  if (!project || project.status === 'archived') return '';
  return [
    '<omniagent-project>',
    `项目：${project.name}`,
    project.description ? `描述：${project.description}` : '',
    project.context ? `上下文：${project.context}` : '',
    '</omniagent-project>',
  ].filter(Boolean).join('\n');
}

async function exportWorkspaceData() {
  const [memories, skillsList, projects, settings, activeProjectId, conversations, agentTasks] = await Promise.all([
    storage.listMemories(),
    skills.list(),
    storage.listProjects(),
    getRuntimeSettings(),
    storage.getActiveProjectId(),
    storage.listConversations(),
    storage.listAgentTasks(),
  ]);
  const conversationPayload = await Promise.all(conversations.map(async (item) => ({
    id: item.id,
    providerId: item.providerId,
    externalId: item.externalId,
    title: item.title,
    projectId: item.projectId,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    messages: await storage.listMessages(item.id),
  })));
  return {
    version: 2,
    exportedAt: Date.now(),
    settings,
    activeProjectId,
    memories,
    skills: skillsList,
    projects,
    agentTasks,
    conversations: conversationPayload,
  };
}

async function importWorkspaceData(raw: string) {
  let parsed: {
    settings?: Partial<RuntimeSettings>;
    activeProjectId?: string | null;
    memories?: Array<Record<string, unknown>>;
    skills?: Array<Record<string, unknown>>;
    projects?: Array<Record<string, unknown>>;
    conversations?: Array<Record<string, unknown>>;
    agentTasks?: Array<Record<string, unknown>>;
  };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    throw new Error('导入 JSON 无效');
  }

  if (parsed.settings) {
    const current = await getRuntimeSettings();
    await storage.setSetting(runtimeSettingsKey, {
      injectMemory: parsed.settings.injectMemory ?? current.injectMemory,
      injectSkills: parsed.settings.injectSkills ?? current.injectSkills,
      injectTools: parsed.settings.injectTools ?? current.injectTools,
      injectProject: parsed.settings.injectProject ?? current.injectProject,
    });
  }

  let importedProjects = 0;
  for (const project of parsed.projects ?? []) {
    if (typeof project.name !== 'string' || !project.name.trim()) continue;
    await storage.saveProject({
      id: typeof project.id === 'string' && project.id ? project.id : crypto.randomUUID(),
      name: project.name.trim(),
      description: typeof project.description === 'string' ? project.description : '',
      context: typeof project.context === 'string' ? project.context : '',
      status: project.status === 'paused' || project.status === 'archived' ? project.status : 'active',
    });
    importedProjects += 1;
  }
  if (typeof parsed.activeProjectId === 'string' || parsed.activeProjectId === null) {
    await storage.setActiveProjectId(parsed.activeProjectId);
  }

  let importedMemories = 0;
  for (const item of parsed.memories ?? []) {
    if (typeof item.content !== 'string' || !item.content.trim()) continue;
    await memory.save({
      type: (item.type as 'knowledge' | 'preference' | 'profile' | 'project' | 'episode' | 'procedure') || 'knowledge',
      content: item.content,
      summary: typeof item.summary === 'string' ? item.summary : undefined,
      importance: typeof item.importance === 'number' ? item.importance : 0.7,
      confidence: typeof item.confidence === 'number' ? item.confidence : 0.8,
      scope: item.scope === 'provider' || item.scope === 'project' ? item.scope : 'global',
      providerId: (item.providerId as 'deepseek' | 'kimi' | null | undefined) ?? null,
      projectId: typeof item.projectId === 'string' ? item.projectId : null,
    });
    importedMemories += 1;
  }

  let importedSkills = 0;
  for (const item of parsed.skills ?? []) {
    const name = typeof item.name === 'string'
      ? item.name
      : (item.manifest && typeof item.manifest === 'object' && typeof (item.manifest as { name?: string }).name === 'string'
        ? (item.manifest as { name: string }).name
        : '');
    const prompt = typeof item.prompt === 'string' ? item.prompt : '';
    if (!name.trim() || !prompt.trim()) continue;
    const manifest = (item.manifest && typeof item.manifest === 'object')
      ? item.manifest as Record<string, unknown>
      : {};
    await skills.register({
      id: typeof item.id === 'string' ? item.id : undefined,
      name,
      description: typeof item.description === 'string'
        ? item.description
        : (typeof manifest.description === 'string' ? manifest.description : name),
      prompt,
      triggers: Array.isArray(item.triggers)
        ? item.triggers as string[]
        : (Array.isArray(manifest.triggers) ? manifest.triggers as string[] : []),
      tools: Array.isArray(item.tools)
        ? item.tools as string[]
        : (Array.isArray(manifest.tools) ? manifest.tools as string[] : []),
      workflow: Array.isArray(item.workflow) ? item.workflow as string[] : [],
      source: item.source === 'builtin' ? 'builtin' : 'user',
      enabled: item.enabled !== false,
    });
    importedSkills += 1;
  }

  let importedConversations = 0;
  let importedMessages = 0;
  for (const item of parsed.conversations ?? []) {
    if (typeof item.providerId !== 'string' || typeof item.externalId !== 'string') continue;
    if (item.providerId !== 'deepseek' && item.providerId !== 'kimi') continue;
    const conversation = await storage.getOrCreateConversation({
      providerId: item.providerId,
      externalId: item.externalId,
      title: typeof item.title === 'string' ? item.title : null,
      projectId: typeof item.projectId === 'string' ? item.projectId : null,
    });
    importedConversations += 1;
    const messages = Array.isArray(item.messages) ? item.messages : [];
    for (const message of messages) {
      if (!message || typeof message !== 'object') continue;
      const row = message as Record<string, unknown>;
      if (typeof row.content !== 'string' || !row.content.trim()) continue;
      const role = row.role === 'assistant' || row.role === 'system' || row.role === 'tool' ? row.role : 'user';
      await storage.upsertMessage({
        conversationId: conversation.id,
        externalId: typeof row.externalId === 'string' ? row.externalId : null,
        role,
        content: row.content,
        attachments: Array.isArray(row.attachments) ? row.attachments as string[] : [],
      });
      importedMessages += 1;
    }
  }

  let importedAgentTasks = 0;
  for (const item of parsed.agentTasks ?? []) {
    if (typeof item.id !== 'string' || typeof item.goal !== 'string' || !item.goal.trim()) continue;
    await storage.saveAgentTask({
      id: item.id,
      goal: item.goal,
      status: (item.status as AgentTaskRecord['status']) || 'stopped',
      steps: Array.isArray(item.steps) ? item.steps : [],
      result: typeof item.result === 'string' ? item.result : null,
      error: typeof item.error === 'string' ? item.error : null,
      providerId: item.providerId === 'deepseek' || item.providerId === 'kimi' ? item.providerId : null,
      projectId: typeof item.projectId === 'string' ? item.projectId : null,
      createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
      updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
    });
    importedAgentTasks += 1;
  }
  if (importedAgentTasks > 0) {
    agentReady = null;
    await ensureAgentReady();
  }

  return {
    ok: true,
    importedProjects,
    importedMemories,
    importedSkills,
    importedConversations,
    importedMessages,
    importedAgentTasks,
  };
}

async function persistPageMessage(message: ExtensionMessage<'omni:response-update'>) {
  const payload = message.payload;
  if (!payload?.conversationId) return;
  const activeProjectId = await storage.getActiveProjectId();
  const conversation = await storage.getOrCreateConversation({
    providerId: payload.provider,
    externalId: payload.conversationId,
    title: payload.role === 'user' ? summarizeTitle(payload.text) : null,
    projectId: activeProjectId,
  });
  if (payload.role === 'user' && !conversation.title) {
    await storage.updateConversationTitle(conversation.id, summarizeTitle(payload.text));
  }
  await storage.upsertMessage({
    conversationId: conversation.id,
    externalId: payload.messageId,
    role: payload.role,
    content: payload.text,
    attachments: [],
  });
  if (payload.role === 'user') {
    await memory.extractExplicitUserMemory(payload.text, { projectId: activeProjectId });
  }
}

interface RuntimeSettings {
  injectMemory: boolean;
  injectSkills: boolean;
  injectTools: boolean;
  injectProject: boolean;
}

async function getRuntimeSettings(): Promise<RuntimeSettings> {
  const stored = await storage.getSetting<Partial<RuntimeSettings>>(runtimeSettingsKey);
  return {
    injectMemory: stored?.injectMemory ?? true,
    injectSkills: stored?.injectSkills ?? true,
    injectTools: stored?.injectTools ?? true,
    injectProject: stored?.injectProject ?? true,
  };
}

async function listToolHistory(): Promise<ToolHistoryItem[]> {
  return (await storage.getSetting<ToolHistoryItem[]>(toolHistoryKey)) ?? [];
}

async function appendToolHistory(item: ToolHistoryItem): Promise<void> {
  const history = await listToolHistory();
  const next = [item, ...history].slice(0, MAX_TOOL_HISTORY);
  await storage.setSetting(toolHistoryKey, next);
}

function summarizeTitle(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > 40 ? `${normalized.slice(0, 37)}...` : normalized;
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
