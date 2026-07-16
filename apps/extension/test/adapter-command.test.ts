import assert from 'node:assert/strict';
import test from 'node:test';
import type { AdapterStatus, ExtensionMessage } from '@omni-agent/shared';
import type { SiteAdapter } from '@omni-agent/site-adapters';
import {
  captureAdapterCommand,
  handleAdapterPageCommand,
  isAdapterPageCommand,
  unwrapAdapterCommandResult,
} from '../src/adapter-command.js';

const status: AdapterStatus = {
  provider: 'kimi',
  url: 'https://www.kimi.com/',
  conversationId: null,
};

function adapter(overrides: Partial<SiteAdapter> = {}): SiteAdapter {
  return {
    id: 'kimi',
    match: () => true,
    insertPrompt: async () => undefined,
    sendMessage: async () => undefined,
    inspectHealth: () => ({
      contentScript: true,
      inputFound: true,
      submitFound: true,
      submitEnabled: true,
      messageCount: 0,
      responseCount: 0,
      checkedAt: 1,
    }),
    hideInternalProtocolMessages: () => undefined,
    renderToolStatus: () => true,
    getLatestTurn: () => ({ question: 'q', response: 'a' }),
    observeMessages: () => () => undefined,
    observeResponse: () => () => undefined,
    getConversationId: () => null,
    ...overrides,
  };
}

test('wraps a successful page command in a serializable result', async () => {
  let sent = '';
  const result = await handleAdapterPageCommand(
    { type: 'omni:send-message', payload: { message: 'hello' } },
    adapter({ sendMessage: async (message) => { sent = message; } }),
    () => status,
  );

  assert.equal(sent, 'hello');
  assert.deepEqual(result, { ok: true, value: status });
  assert.deepEqual(unwrapAdapterCommandResult<AdapterStatus>(result), status);
});

test('returns an actionable error instead of rejecting the Chrome message channel', async () => {
  const result = await handleAdapterPageCommand(
    { type: 'omni:send-message', payload: { message: 'new prompt' } },
    adapter({ sendMessage: async () => { throw new Error('kimi: message input is not empty'); } }),
    () => status,
  );

  assert.deepEqual(result, {
    ok: false,
    error: 'Kimi 输入框中已有未发送内容，请先发送或清空现有草稿后重试',
  });
  assert.throws(
    () => unwrapAdapterCommandResult(result),
    /Kimi 输入框中已有未发送内容/,
  );
});

test('treats a missing runtime response as a visible adapter failure', () => {
  assert.throws(
    () => unwrapAdapterCommandResult(undefined),
    /页面适配器未返回执行结果/,
  );
});

test('keeps background errors serializable and only claims page commands', async () => {
  assert.equal(isAdapterPageCommand({ type: 'omni:adapter-status' }), true);
  assert.equal(isAdapterPageCommand({ type: 'omni:insert-prompt', payload: { message: 'x' } }), true);
  assert.equal(isAdapterPageCommand({ type: 'omni:list-memories' } as ExtensionMessage), false);
  assert.deepEqual(
    await captureAdapterCommand(async () => { throw new Error('页面适配器未就绪'); }),
    { ok: false, error: '页面适配器未就绪' },
  );
});
