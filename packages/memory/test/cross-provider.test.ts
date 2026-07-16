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

test('release gate: a verified DeepSeek save is persisted and recalled by Kimi', async (t) => {
  const storage = new OmniAgentStorage(new OmniAgentDatabase(`omni-agent-cross-provider-${randomUUID()}`));
  const memory = new MemoryService(storage);
  t.after(() => storage.db.delete());

  const content = '项目发布代号是北极星 0715';
  const outcome = await memory.propose({
    type: 'project',
    scope: 'global',
    content,
    importance: 0.9,
    confidence: 1,
    sourceKind: 'user_message',
    sourceMessageId: 'deepseek:user:release-1',
    sourceQuote: content,
    policy: 'auto_safe',
    explicitUserIntent: true,
  });

  assert.equal(outcome.status, 'created');
  assert.ok(outcome.fact?.id);
  assert.equal((await memory.listCandidates('pending')).length, 0);

  const facts = await storage.listMemoryFacts({ status: 'active' });
  assert.equal(facts.length, 1);
  assert.equal(facts[0]?.value, content);
  const evidence = await storage.listMemoryEvidence(facts[0]!.id);
  assert.equal(evidence[0]?.sourceMessageId, 'deepseek:user:release-1');
  assert.equal(evidence[0]?.excerpt, content);

  const kimiMatches = await memory.retrieve('发布代号 北极星', { providerId: 'kimi' });
  assert.equal(kimiMatches.length, 1);
  assert.equal(kimiMatches[0]?.memory.content, content);
  assert.match(memory.formatContext(kimiMatches), /北极星 0715/u);
});
