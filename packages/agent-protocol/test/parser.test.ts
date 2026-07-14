import assert from 'node:assert/strict';
import test from 'node:test';
import { buildContinuationPrompt, parseAgentDecision, serializeAgentDecision, serializeToolResult } from '../src/index.js';

test('parses a tool call inside model prose', () => {
  const parsed = parseAgentDecision(`我将先查看页面。\n<omniagent-action>\n{"type":"tool_call","toolName":"browser.snapshot","arguments":{}}\n</omniagent-action>`);
  assert.deepEqual(parsed, {
    ok: true,
    raw: '我将先查看页面。\n<omniagent-action>\n{"type":"tool_call","toolName":"browser.snapshot","arguments":{}}\n</omniagent-action>',
    decision: { type: 'tool_call', toolName: 'browser.snapshot', arguments: {} },
  });
});

test('parses ask_user and finish decisions', () => {
  const askUser = parseAgentDecision('<omniagent-action>{"type":"ask_user","message":"请选择仓库"}</omniagent-action>');
  assert.equal(askUser.ok, true);
  if (askUser.ok) assert.deepEqual(askUser.decision, { type: 'ask_user', message: '请选择仓库' });

  const finish = parseAgentDecision('<omniagent-action>{"type":"finish","result":"已完成"}</omniagent-action>');
  assert.equal(finish.ok, true);
  if (finish.ok) assert.deepEqual(finish.decision, { type: 'finish', result: '已完成' });
});

test('rejects missing envelopes and malformed executable decisions', () => {
  assert.equal(parseAgentDecision('{"type":"finish","result":"已完成"}').ok, false);
  assert.equal(parseAgentDecision('<omniagent-action>{"type":"tool_call","toolName":"browser.snapshot","arguments":[]}</omniagent-action>').ok, false);
  assert.equal(parseAgentDecision('<omniagent-action>{"type":"unknown"}</omniagent-action>').ok, false);
});

test('serializes decisions in the required envelope', () => {
  assert.equal(
    serializeAgentDecision({ type: 'finish', result: '已完成' }),
    '<omniagent-action>\n{\n  "type": "finish",\n  "result": "已完成"\n}\n</omniagent-action>',
  );
});

test('serializes tool results for model continuation', () => {
  assert.match(serializeToolResult({ name: 'memory.save', ok: true, result: { id: 'm1' } }), /<omniagent-tool-result>/);
});

test('builds a bounded continuation prompt with the protocol contract', () => {
  const prompt = buildContinuationPrompt({
    goal: '打开 GitHub 并搜索 OmniAgent',
    currentStatus: 'waiting_model',
    availableTools: '- browser.navigate\n- browser.snapshot',
    completedSteps: [
      { index: 0, title: '打开 GitHub', toolName: 'browser.navigate', ok: true },
      { index: 1, title: '页面快照', toolName: 'browser.snapshot', ok: true },
    ],
    latestToolResult: { url: 'https://github.com' },
  });

  assert.match(prompt, /<omniagent-task>/);
  assert.match(prompt, /Goal:\n打开 GitHub 并搜索 OmniAgent/);
  assert.match(prompt, /\[成功\] 打开 GitHub \(browser.navigate\)/);
  assert.match(prompt, /<omniagent-action>/);
});
