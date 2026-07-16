import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { OmniAgentDatabase, OmniAgentStorage } from '@omni-agent/storage';
import { MemoryService, splitMemoryAtSemanticBoundaries } from '../src/index.js';

if (typeof globalThis.CustomEvent === 'undefined') {
  globalThis.CustomEvent = class CustomEvent<T = unknown> extends Event {
    readonly detail: T;
    constructor(type: string, params?: CustomEventInit<T>) { super(type, params); this.detail = params?.detail as T; }
  } as typeof CustomEvent;
}

function createMemory(t: test.TestContext): { storage: OmniAgentStorage; memory: MemoryService } {
  const storage = new OmniAgentStorage(new OmniAgentDatabase(`omni-agent-memory-test-${randomUUID()}`));
  t.after(() => storage.db.delete());
  return { storage, memory: new MemoryService(storage) };
}

test('stores a manual fact once and reinforces evidence for the same value', async (t) => {
  const { storage, memory } = createMemory(t);
  const first = await memory.save({ type: 'preference', content: '我喜欢简洁的中文回复', importance: 0.8 });
  const second = await memory.save({ type: 'preference', content: '我喜欢  简洁的中文回复', importance: 0.8 });

  assert.equal(first.id, second.id);
  const facts = await storage.listMemoryFacts({ status: 'active' });
  assert.equal(facts.length, 1);
  assert.equal(facts[0]?.sourceCount, 2);
  assert.equal((await storage.listMemoryEvidence(first.id)).length, 2, 'each user save contributes traceable evidence');
});

test('changes to a known fact create a revision instead of duplicate facts', async (t) => {
  const { storage, memory } = createMemory(t);
  const saved = await memory.save({ type: 'preference', content: '我喜欢详细说明' });
  const updated = await memory.update(saved.id, { content: '我喜欢简洁说明', pinned: true });

  assert.equal(updated.id, saved.id);
  assert.equal(updated.content, '我喜欢简洁说明');
  assert.equal((await storage.listMemoryFacts({ status: 'active' })).length, 1);
  const revisions = await storage.db.memoryRevisions.where('factId').equals(saved.id).toArray();
  assert.equal(revisions.length, 1);
  assert.equal(revisions[0]?.previousValue, '我喜欢详细说明');
});

test('automatic explicit user memory follows review policy and cannot enter recall before acceptance', async (t) => {
  const { memory } = createMemory(t);
  const proposal = await memory.propose({
    type: 'preference', content: '我喜欢简洁的中文回复', sourceKind: 'user_message', sourceMessageId: 'message-1',
    policy: 'review_all', explicitUserIntent: true, confidence: 0.95,
  });
  assert.equal(proposal.status, 'pending_confirmation');
  assert.equal((await memory.retrieve('请简洁回答')).length, 0);

  const accepted = await memory.acceptCandidate(proposal.candidate!.id);
  assert.equal(accepted.status, 'created');
  assert.equal((await memory.retrieve('请简洁回答')).length, 1);
});

test('an explicitly requested model memory save writes directly in auto-safe mode', async (t) => {
  const { memory } = createMemory(t);
  const outcome = await memory.propose({
    type: 'profile', content: '朋友小白有一条狗叫小黑', sourceKind: 'model_tool',
    policy: 'auto_safe', explicitUserIntent: true, sourceVerified: true, confidence: 1,
  });
  assert.equal(outcome.status, 'created');
  assert.equal((await memory.listCandidates('pending')).length, 0);
  assert.equal((await memory.retrieve('小白的狗叫什么')).length, 1);
});

test('a source-verified safe model extraction saves automatically without an explicit command', async (t) => {
  const { memory } = createMemory(t);
  const outcome = await memory.propose({
    type: 'profile', content: '我的孩子正在上幼儿园', sourceKind: 'model_tool',
    sourceMessageId: 'message-1', sourceQuote: '我的孩子正在上幼儿园',
    policy: 'auto_safe', explicitUserIntent: false, sourceVerified: true, confidence: 1,
  });
  assert.equal(outcome.status, 'created');
  assert.equal((await memory.listCandidates('pending')).length, 0);
});

test('an unverified model extraction still requires review in auto-safe mode', async (t) => {
  const { memory } = createMemory(t);
  const outcome = await memory.propose({
    type: 'profile', content: '我的孩子正在上幼儿园', sourceKind: 'model_tool',
    policy: 'auto_safe', explicitUserIntent: false, confidence: 1,
  });
  assert.equal(outcome.status, 'pending_confirmation');
});

test('automatically saves durable user profile statements under the safe policy', async (t) => {
  const { memory } = createMemory(t);
  const saved = await memory.extractExplicitUserMemory('我家有一个正在上幼儿园的孩子', { policy: 'auto_safe' });
  assert.equal(saved?.type, 'profile');
  assert.equal((await memory.list()).length, 1);
});

test('automatically saves named people from concise user facts', async (t) => {
  const { memory } = createMemory(t);
  const saved = await memory.extractExplicitUserMemory('朋友名字叫小白', { policy: 'auto_safe' });
  assert.equal(saved?.type, 'profile');
  assert.equal(saved?.content, '朋友名字叫小白');
});

test('does not save a standalone unfinished preference and injects a complete preference across conversations', async (t) => {
  const { memory } = createMemory(t);
  assert.equal(await memory.extractExplicitUserMemory('我不喜欢吃', { policy: 'auto_safe' }), null);
  const saved = await memory.extractExplicitUserMemory('我不喜欢吃香菜', { policy: 'auto_safe' });
  assert.equal(saved?.type, 'preference');
  const matches = await memory.retrieve('我们聊点别的事情', { providerId: 'kimi' });
  assert.equal(matches.some((item) => item.memory.content === '我不喜欢吃香菜'), true);
  assert.match(memory.formatContext(matches), /香菜/);
});

test('never saves a user question as a profile or preference fact', async (t) => {
  const { memory } = createMemory(t);
  assert.equal(await memory.extractExplicitUserMemory('我叫什么，不喜欢吃什么', { policy: 'auto_safe' }), null);
  assert.equal(await memory.extractExplicitUserMemory('我叫什么？', { policy: 'auto_safe' }), null);
  assert.equal(await memory.extractExplicitUserMemory('我喜欢吃什么。', { policy: 'auto_safe' }), null);
  assert.equal(await memory.extractExplicitUserMemory('我不喜欢吃哪些？', { policy: 'auto_safe' }), null);
  assert.equal((await memory.list()).length, 0);
});

test('different automatic values for the same canonical key become a conflict candidate', async (t) => {
  const { memory } = createMemory(t);
  await memory.save({ type: 'preference', content: '我喜欢简洁的中文回复' });
  const outcome = await memory.propose({
    type: 'preference', content: '我喜欢详细的中文回复', sourceKind: 'user_message', sourceMessageId: 'message-2',
    policy: 'auto_safe', explicitUserIntent: true, confidence: 0.98,
  });
  assert.equal(outcome.status, 'conflict');
  assert.equal((await memory.list()).length, 1);
  assert.equal((await memory.listCandidates('conflict')).length, 1);
});

test('assistant replies and secrets are never automatically persisted', async (t) => {
  const { memory } = createMemory(t);
  const assistant = await memory.propose({ type: 'knowledge', content: '你好，我是 AI 助手', sourceKind: 'assistant_reply' });
  const secret = await memory.propose({ type: 'profile', content: 'api_key=not-for-memory', sourceKind: 'user_message', policy: 'auto_safe', explicitUserIntent: true, confidence: 1 });
  assert.equal(assistant.status, 'rejected_policy');
  assert.equal(secret.status, 'rejected_security');
  assert.equal((await memory.list()).length, 0);
});

test('manual secrets remain local but are excluded from retrieval and prompt context', async (t) => {
  const { memory } = createMemory(t);
  await memory.save({ type: 'profile', content: 'api_key=manual-secret' });
  assert.equal((await memory.retrieve('api key')).length, 0);
  assert.equal(memory.formatContext(await memory.retrieve('api key')), '');
});

test('scope isolates project facts and preserves global facts across providers', async (t) => {
  const { memory } = createMemory(t);
  await memory.save({ type: 'preference', content: '我喜欢简洁的中文回复', scope: 'global' });
  await memory.save({ type: 'project', content: '本项目使用 pnpm', scope: 'project', projectId: 'p1' });
  assert.equal((await memory.retrieve('请简洁回答', { providerId: 'kimi' })).length, 1);
  const otherProject = await memory.retrieve('pnpm', { projectId: 'p2' });
  assert.equal(otherProject.length, 1);
  assert.equal(otherProject[0]?.memory.scope, 'global');
  const activeProject = await memory.retrieve('pnpm', { projectId: 'p1' });
  assert.equal(activeProject.some((item) => item.memory.scope === 'project'), true);
});

test('ranks the active project scope ahead of an equally relevant global fact', async (t) => {
  const { memory, storage } = createMemory(t);
  await memory.save({ type: 'knowledge', content: 'pnpm 使用全局镜像配置', scope: 'global', importance: 0.5 });
  await memory.save({ type: 'project', content: 'pnpm 是当前项目的包管理器', scope: 'project', projectId: 'p1', importance: 0.5 });
  const matches = await memory.retrieve('pnpm', { projectId: 'p1' });
  assert.equal(matches[0]?.memory.scope, 'project');
  assert.equal(matches.length, 2);
  const logs = await storage.listMemoryRecallLogs();
  assert.equal(logs[0]?.resultCount, 2);
});

test('legacy migration is incremental and retains old rows', async (t) => {
  const { storage, memory } = createMemory(t);
  await storage.saveMemory({ type: 'profile', scope: 'global', providerId: null, projectId: null, content: '我叫小峰', summary: '我叫小峰', keywords: ['小峰'], importance: 0.5, confidence: 0.8 });
  await storage.saveMemory({ type: 'profile', scope: 'global', providerId: null, projectId: null, content: '我叫小峰', summary: '我叫小峰', keywords: ['小峰'], importance: 0.5, confidence: 0.8 });
  const result = await memory.migrateLegacy(1);
  assert.equal(result.migrated, 1);
  assert.equal((await storage.listMemories()).length, 2);
  assert.equal((await memory.list()).length, 1);
  await memory.migrateLegacy(100);
  assert.equal((await storage.listMemoryFacts({ status: 'active' }))[0]?.sourceCount, 2);
});

test('expires unconfirmed candidates and archives stale low-retention facts without deleting them', async (t) => {
  const storage = new OmniAgentStorage(new OmniAgentDatabase(`omni-agent-memory-test-${randomUUID()}`));
  t.after(() => storage.db.delete());
  let now = Date.now();
  const memory = new MemoryService(storage, () => now);

  const candidate = await memory.propose({
    type: 'knowledge', content: '待确认的临时信息', sourceKind: 'model_tool', policy: 'review_all', confidence: 1,
  });
  const episode = await memory.save({ type: 'episode', content: '本次会议决定周五发布', importance: 1, confidence: 1 });
  const knowledge = await memory.save({ type: 'knowledge', content: '低权重旧知识', importance: 0.1, confidence: 0.1 });

  now += 181 * 24 * 60 * 60 * 1000;
  const maintenance = await memory.maintainLifecycle();

  assert.equal(maintenance.expiredCandidates, 1);
  assert.equal(maintenance.archivedFacts, 2);
  assert.equal((await storage.getMemoryCandidate(candidate.candidate!.id))?.status, 'expired');
  assert.equal((await storage.db.memoryFacts.get(episode.id))?.status, 'archived');
  assert.equal((await storage.db.memoryFacts.get(knowledge.id))?.status, 'archived');
  assert.equal((await memory.retrieve('发布 临时 旧知识')).length, 0);
});

test('splits long content only at semantic boundaries near the target size', () => {
  const questionOne = `1. 第一题题干\n答案：A\n解析：${'第一题说明。'.repeat(90)}`;
  const questionTwo = `2. 第二题题干\n答案：B\n解析：${'第二题说明。'.repeat(90)}`;
  const chunks = splitMemoryAtSemanticBoundaries(`${questionOne}\n\n${questionTwo}`, 800);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0], questionOne);
  assert.equal(chunks[1], questionTwo);
  assert.ok(chunks.every((chunk) => chunk.includes('答案：')));
});

test('preserves file provenance and injects the complete semantic chunk', async (t) => {
  const { storage, memory } = createMemory(t);
  const artifact = await storage.saveMemoryArtifact({
    contentHash: 'hash-file-1',
    fileName: '考试题库.txt',
    mimeType: 'text/plain',
    size: 900,
    providerId: 'deepseek',
    conversationId: 'conversation-1',
    projectId: null,
    pageSessionId: 'page-1',
    status: 'imported',
  });
  const content = `第 21 题：境外活动保密事项有哪些？\n选项：ABCD\n答案：ABCD\n${'完整解析内容。'.repeat(40)}`;
  const outcome = await memory.propose({
    type: 'knowledge',
    content,
    sourceKind: 'file_import',
    artifactId: artifact.id,
    artifactLocator: { fileName: artifact.fileName, page: 3, question: '第 21 题', label: '考试题库.txt · 第 3 页 · 第 21 题' },
    policy: 'auto_safe',
    explicitUserIntent: true,
    confidence: 1,
  });

  assert.equal(outcome.status, 'created');
  const matches = await memory.retrieve('境外活动 保密 21题');
  const context = memory.formatContext(matches);
  assert.match(context, /完整解析内容/u);
  assert.match(context, /考试题库\.txt/u);
  assert.equal(matches[0]?.memory.content, content);
  const evidence = await storage.listMemoryEvidence(outcome.fact!.id);
  assert.equal(evidence[0]?.artifactId, artifact.id);
  assert.equal(evidence[0]?.artifactLocator?.question, '第 21 题');
});

test('keeps the verified quote when a chat candidate is accepted', async (t) => {
  const { storage, memory } = createMemory(t);
  const outcome = await memory.propose({
    type: 'profile',
    content: '小白有一条狗叫小黑',
    sourceKind: 'model_tool',
    sourceMessageId: 'message-1',
    sourceQuote: '我的朋友小白有一条狗叫小黑',
    policy: 'review_all',
    explicitUserIntent: false,
    confidence: 1,
  });
  assert.equal(outcome.status, 'pending_confirmation');
  const accepted = await memory.acceptCandidate(outcome.candidate!.id);
  const evidence = await storage.listMemoryEvidence(accepted.fact!.id);
  assert.equal(evidence[0]?.sourceMessageId, 'message-1');
  assert.equal(evidence[0]?.excerpt, '我的朋友小白有一条狗叫小黑');
});
