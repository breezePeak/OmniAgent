import assert from 'node:assert/strict';
import test from 'node:test';
import { ResponseObserver } from '../src/index.js';

test('emits one settled response after streaming updates stop', async () => {
  const responses: Array<{ id: string; text: string; conversationId: string | null }> = [];
  const observer = new ResponseObserver(
    (response) => responses.push(response),
    { settleDelayMs: 5, getConversationId: () => 'conversation-1' },
  );

  observer.observe({ id: 'assistant-1', role: 'assistant', text: '第一段' });
  observer.observe({ id: 'assistant-1', role: 'assistant', text: '完整回复' });
  await new Promise((resolve) => setTimeout(resolve, 15));

  assert.deepEqual(responses.map(({ id, text, conversationId }) => ({ id, text, conversationId })), [
    { id: 'assistant-1', text: '完整回复', conversationId: 'conversation-1' },
  ]);
  observer.dispose();
});

test('does not emit user messages and cancels pending replies on dispose', async () => {
  const responses: string[] = [];
  const observer = new ResponseObserver(
    (response) => responses.push(response.text),
    { settleDelayMs: 5, getConversationId: () => null },
  );

  observer.observe({ id: 'user-1', role: 'user', text: '你好' });
  observer.observe({ id: 'assistant-1', role: 'assistant', text: '待取消' });
  observer.dispose();
  await new Promise((resolve) => setTimeout(resolve, 15));

  assert.deepEqual(responses, []);
});
