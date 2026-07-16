import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isBulkMemoryCommand,
  isContextualMemoryCommand,
  isExplicitMemoryCommand,
  isFileMemoryCommand,
  userFacingMemoryCommandText,
} from '../src/memory-intent.js';

test('recognizes explicit file-memory wording used by DeepSeek users', () => {
  const text = '帮我记忆这些考题，等我考试的时候需要问你';
  assert.equal(isFileMemoryCommand(text), true);
  assert.equal(isExplicitMemoryCommand(text), true);
});

test('recognizes supported explicit and bulk save commands', () => {
  for (const text of ['记住这个附件', '请帮我记下这份 PDF', '把所有题目保存到长期记忆', '不要废话，全部保存']) {
    assert.equal(isExplicitMemoryCommand(text), true, text);
  }
  assert.equal(isBulkMemoryCommand('不要废话，全部保存'), true);
});

test('recognizes concise direct commands without a polite prefix', () => {
  for (const text of ['记住：服务端口是 8080', '记住我叫张三', '我叫张三，记住']) {
    assert.equal(isExplicitMemoryCommand(text), true, text);
  }
});

test('does not turn memory questions or negated commands into writes', () => {
  for (const text of ['如何查看记忆', '我的记忆有问题', '为什么没有记忆', '不要保存这个文件', '别把这些考题记住', '我没让你把这个文件保存到记忆里', '不要把这段聊天保存到记忆里']) {
    assert.equal(isExplicitMemoryCommand(text), false, text);
    assert.equal(isFileMemoryCommand(text), false, text);
  }
});

test('recognizes a save command that refers to the preceding attachment', () => {
  const text = '我让你保存到记忆里，我会跨对话的';
  assert.equal(isExplicitMemoryCommand(text), true);
  assert.equal(isFileMemoryCommand(text), false);
  assert.equal(isContextualMemoryCommand(text), true);
});

test('recognizes references to preceding or current conversation content', () => {
  for (const text of ['记住以上内容', '请把这段内容保存到长期记忆', '把当前对话保存到长期记忆']) {
    assert.equal(isContextualMemoryCommand(text), true, text);
  }
});

test('extracts the user sentence from a provider-rendered augmented prompt', () => {
  assert.equal(
    userFacingMemoryCommandText('<omniagent-tools>...</omniagent-tools>\n用户当前问题：帮我记忆这些考题'),
    '帮我记忆这些考题',
  );
});
