import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { OmniAgentDatabase, OmniAgentStorage } from '../src/index.js';

if (typeof globalThis.CustomEvent === 'undefined') {
  globalThis.CustomEvent = class CustomEvent<T = unknown> extends Event {
    readonly detail: T;
    constructor(type: string, params?: CustomEventInit<T>) {
      super(type, params);
      this.detail = params?.detail as T;
    }
  } as typeof CustomEvent;
}

function createStorage() {
  return new OmniAgentStorage(new OmniAgentDatabase(`omni-agent-test-${randomUUID()}`));
}

test('stores providers, conversations, messages, and settings locally', async (t) => {
  const storage = createStorage();
  t.after(() => storage.db.delete());

  await storage.upsertProvider({
    id: 'deepseek',
    name: 'DeepSeek',
    adapter: 'deepseek',
    capabilities: ['conversation'],
  });
  const conversation = await storage.getOrCreateConversation({
    providerId: 'deepseek',
    externalId: 'session-1',
    title: '测试会话',
  });
  await storage.upsertMessage({
    conversationId: conversation.id,
    externalId: 'user-1',
    role: 'user',
    content: '你好',
    attachments: [],
  });
  await storage.upsertMessage({
    conversationId: conversation.id,
    externalId: 'assistant-1',
    role: 'assistant',
    content: '初始回复',
    attachments: [],
  });
  await storage.upsertMessage({
    conversationId: conversation.id,
    externalId: 'assistant-1',
    role: 'assistant',
    content: '流式回复完成',
    attachments: [],
  });
  await storage.setSetting('theme', 'dark');
  await storage.saveSkill({
    id: 'concise-reply',
    name: 'concise-reply',
    version: '1.0.0',
    description: '简洁回复',
    prompt: '请简洁回答',
    tools: [],
    permissions: [],
    triggers: ['简洁'],
    workflow: [],
    knowledge: [],
    enabled: true,
    source: 'builtin',
  });

  const conversations = await storage.listConversations('deepseek');
  const messages = await storage.listMessages(conversation.id);
  const skills = await storage.listSkills();

  assert.equal(conversations.length, 1);
  assert.equal(conversations[0]?.externalId, 'session-1');
  assert.equal(messages.length, 2);
  assert.equal(messages[1]?.content, '流式回复完成');
  assert.equal(await storage.getSetting('theme'), 'dark');
  assert.equal(skills.length, 1);
  assert.equal(skills[0]?.name, 'concise-reply');

  await storage.saveAgentTask({
    id: 'task-1',
    goal: '测试任务',
    status: 'completed',
    steps: [{ id: 's1', index: 0, type: 'finish', title: 'done', createdAt: Date.now() }],
    result: 'ok',
    error: null,
    providerId: 'deepseek',
    projectId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  const tasks = await storage.listAgentTasks();
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0]?.goal, '测试任务');

  await storage.updateConversationTitle(conversation.id, '更新标题');
  assert.equal((await storage.listConversations('deepseek'))[0]?.title, '更新标题');
  await storage.deleteConversation(conversation.id);
  assert.equal((await storage.listConversations('deepseek')).length, 0);
  assert.equal((await storage.listMessages(conversation.id)).length, 0);

  const project = await storage.saveProject({
    id: 'project-1',
    name: 'OmniAgent',
    description: '个人 AI 系统',
    context: '跨平台记忆与工具',
    status: 'active',
  });
  await storage.setActiveProjectId(project.id);
  assert.equal(await storage.getActiveProjectId(), 'project-1');
  assert.equal((await storage.listProjects())[0]?.name, 'OmniAgent');

  const projectConversation = await storage.getOrCreateConversation({
    providerId: 'kimi',
    externalId: 'kimi-1',
    title: '项目会话',
    projectId: 'project-1',
  });
  assert.equal(projectConversation.projectId, 'project-1');
  assert.equal((await storage.listConversations('kimi', 'project-1')).length, 1);
  assert.equal((await storage.listConversations('deepseek', 'project-1')).length, 0);
});
