import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { OmniAgentDatabase, OmniAgentStorage } from '@omni-agent/storage';
import { MemoryService } from '../src/index.js';

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
  assert.equal((await memory.retrieve('pnpm', { projectId: 'p2' })).length, 0);
  assert.equal((await memory.retrieve('pnpm', { projectId: 'p1' })).length, 1);
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
