import assert from 'node:assert/strict';
import test from 'node:test';
import { isDurableMemoryContent, validateChatMemoryEvidence } from '../src/memory-write-quality.js';

test('accepts a chat fact only when its quote belongs to the referenced message', () => {
  const result = validateChatMemoryEvidence({
    content: '小白和小黑都喜欢吃骨头',
    type: 'profile',
    importance: 0.8,
    sourceQuotes: ['小白和小黑都喜欢吃骨头'],
    sourceMessageIds: ['message-1'],
  }, [{ id: 'message-1', content: '补充一下：小白和小黑都喜欢吃骨头。' }]);

  assert.deepEqual(result, {
    ok: true,
    sourceMessageId: 'message-1',
    sourceQuote: '小白和小黑都喜欢吃骨头',
  });
});

test('rejects a missing, invented, or mismatched source quote', () => {
  const result = validateChatMemoryEvidence({
    content: '小白喜欢吃鱼',
    sourceQuotes: ['小白喜欢吃鱼'],
    sourceMessageIds: ['message-1'],
  }, [{ id: 'message-1', content: '小白喜欢吃骨头。' }]);

  assert.equal(result.ok, false);
  assert.match(result.reason, /No source quote matched/u);
});

test('rejects UI state, confirmation chatter, reasoning, and tool protocol', () => {
  const rejected = [
    '我在记忆中心明明看到的是5条',
    '第一批已提交，待确认，请回复确认',
    '思考过程：我们需要调用记忆工具',
    '记忆处理完成：已保存 1 条。',
    '记忆保存失败：未检测到附件。',
    '<omniagent-tool-result>{"name":"memory.save_batch"}</omniagent-tool-result>',
  ];
  for (const content of rejected) assert.equal(isDurableMemoryContent(content), false, content);
  assert.equal(isDurableMemoryContent('本项目发布前必须运行完整测试'), true);
});

test('one invalid batch item does not determine another item result', () => {
  const messages = [{ id: 'm1', content: 'A 的答案是 C。B 的答案是 D。' }];
  const invalid = validateChatMemoryEvidence({
    content: 'A 的答案是 B',
    sourceQuotes: ['A 的答案是 B'],
    sourceMessageIds: ['m1'],
  }, messages);
  const valid = validateChatMemoryEvidence({
    content: 'B 的答案是 D',
    sourceQuotes: ['B 的答案是 D'],
    sourceMessageIds: ['m1'],
  }, messages);

  assert.equal(invalid.ok, false);
  assert.equal(valid.ok, true);
});
