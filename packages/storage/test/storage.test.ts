import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { OmniAgentDatabase, OmniAgentStorage } from '../src/index.js';

function createStorage() {
  return new OmniAgentStorage(new OmniAgentDatabase(`omni-agent-test-${crypto.randomUUID()}`));
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

  const conversations = await storage.listConversations('deepseek');
  const messages = await storage.listMessages(conversation.id);

  assert.equal(conversations.length, 1);
  assert.equal(conversations[0]?.externalId, 'session-1');
  assert.equal(messages.length, 2);
  assert.equal(messages[1]?.content, '流式回复完成');
  assert.equal(await storage.getSetting('theme'), 'dark');
});
