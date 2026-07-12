import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { OmniAgentDatabase, OmniAgentStorage } from '@omni-agent/storage';
import { MemoryService } from '../src/index.js';

test('extracts explicit preferences and retrieves them across providers', async (t) => {
  const storage = new OmniAgentStorage(new OmniAgentDatabase(`omni-agent-memory-test-${crypto.randomUUID()}`));
  t.after(() => storage.db.delete());
  const memory = new MemoryService(storage);

  const saved = await memory.extractExplicitUserMemory('请记住：我喜欢简洁的中文回复');
  assert.equal(saved?.type, 'preference');
  assert.equal(saved?.scope, 'global');

  const matches = await memory.retrieve('请使用简洁表达', { providerId: 'kimi' });
  assert.equal(matches.length, 1);
  assert.match(memory.formatContext(matches), /简洁的中文回复/);

  const duplicate = await memory.extractExplicitUserMemory('请记住：我喜欢简洁的中文回复');
  assert.equal(duplicate?.id, saved?.id);
  assert.equal((await storage.listMemories()).length, 1);
});

test('retrieves a saved name for a natural-language identity question', async (t) => {
  const storage = new OmniAgentStorage(new OmniAgentDatabase(`omni-agent-memory-name-test-${crypto.randomUUID()}`));
  t.after(() => storage.db.delete());
  const memory = new MemoryService(storage);

  await memory.save({ type: 'knowledge', content: '我叫小峰，以后你可以喊我名字', importance: 0.7 });
  const matches = await memory.retrieve('你知道我的名字吗', { providerId: 'deepseek' });

  assert.equal(matches.length, 1);
  assert.match(memory.formatContext(matches), /小峰/);
});
