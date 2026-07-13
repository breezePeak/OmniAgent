import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PermissionManager,
  ToolRegistry,
  ToolExecutor,
  createToolRuntime,
  type BrowserSnapshot,
} from '../src/index.js';

test('registers builtins and describes them for prompt injection', () => {
  const runtime = createToolRuntime({
    services: {
      memory: {
        search: async () => [],
        save: async (input) => input,
      },
      browser: createBrowserService(),
    },
  });

  const names = runtime.list().map((tool) => tool.name);
  assert.deepEqual(names, [
    'browser.click',
    'browser.navigate',
    'browser.scroll',
    'browser.snapshot',
    'browser.type',
    'memory.save',
    'memory.search',
  ]);
  assert.match(runtime.describeForPrompt(), /memory\.search/);
});

test('executes memory tools through injected services', async () => {
  const saved: string[] = [];
  const runtime = createToolRuntime({
    services: {
      memory: {
        search: async (query) => [{ summary: `match:${query}`, score: 1 }],
        save: async (input) => {
          saved.push(input.content);
          return { id: 'm1', content: input.content };
        },
      },
    },
  });

  const search = await runtime.execute({ name: 'memory.search', arguments: { query: '偏好' } });
  assert.equal(search.ok, true);
  assert.deepEqual(search.result, [{ summary: 'match:偏好', score: 1 }]);

  const save = await runtime.execute({ name: 'memory.save', arguments: { content: '我喜欢简洁回复' } });
  assert.equal(save.ok, true);
  assert.deepEqual(saved, ['我喜欢简洁回复']);
});

test('checks permissions and validates required parameters', async () => {
  const registry = new ToolRegistry();
  const permissions = new PermissionManager([]);
  const executor = new ToolExecutor(registry, permissions, {
    memory: {
      search: async () => [],
      save: async (input) => input,
    },
  });
  registry.register({
    name: 'memory.search',
    description: 'search',
    source: 'builtin',
    parameters: [{ name: 'query', type: 'string', description: 'q', required: true }],
    permissions: ['memory.read'],
    execute: async () => [],
  });

  const denied = await executor.execute({ name: 'memory.search', arguments: { query: 'x' } });
  assert.equal(denied.ok, false);
  assert.match(denied.error ?? '', /Missing permissions/);

  permissions.grant('memory.read');
  const missing = await executor.execute({ name: 'memory.search', arguments: {} });
  assert.equal(missing.ok, false);
  assert.match(missing.error ?? '', /Missing required parameter/);
});

test('executes browser.snapshot via browser service', async () => {
  const snapshot: BrowserSnapshot = {
    url: 'https://chat.deepseek.com',
    title: 'DeepSeek',
    text: 'page body',
    selectedText: 'selected',
    at: 123,
  };
  const runtime = createToolRuntime({
    services: {
      browser: {
        ...createBrowserService(),
        snapshot: async () => snapshot,
      },
    },
  });
  const result = await runtime.execute({ name: 'browser.snapshot', arguments: {} });
  assert.equal(result.ok, true);
  assert.deepEqual(result.result, snapshot);
});

test('executes browser click/type/scroll/navigate tools', async () => {
  const actions: string[] = [];
  const runtime = createToolRuntime({
    services: {
      browser: {
        snapshot: async () => ({
          url: 'https://example.com',
          title: 'Example',
          text: '',
          selectedText: '',
          at: Date.now(),
        }),
        click: async (options) => {
          actions.push(`click:${options.selector ?? options.text}`);
          return { ok: true, action: 'click', detail: 'button', url: 'https://example.com', title: 'Example' };
        },
        type: async (options) => {
          actions.push(`type:${options.value}`);
          return { ok: true, action: 'type', detail: options.value, url: 'https://example.com', title: 'Example' };
        },
        scroll: async (options) => {
          actions.push(`scroll:${options?.direction ?? 'down'}`);
          return { ok: true, action: 'scroll', detail: 'down', url: 'https://example.com', title: 'Example' };
        },
        navigate: async (options) => {
          actions.push(`navigate:${options.url}`);
          return { ok: true, action: 'navigate', detail: options.url, url: options.url, title: '' };
        },
      },
    },
  });

  assert.equal((await runtime.execute({ name: 'browser.click', arguments: { selector: '#go' } })).ok, true);
  assert.equal((await runtime.execute({ name: 'browser.type', arguments: { selector: '#q', value: 'hi' } })).ok, true);
  assert.equal((await runtime.execute({ name: 'browser.scroll', arguments: { direction: 'down' } })).ok, true);
  assert.equal((await runtime.execute({ name: 'browser.navigate', arguments: { url: 'https://github.com' } })).ok, true);
  assert.deepEqual(actions, ['click:#go', 'type:hi', 'scroll:down', 'navigate:https://github.com']);
});

function createBrowserService() {
  return {
    snapshot: async () => ({
      url: 'https://example.com',
      title: 'Example',
      text: 'hello',
      selectedText: '',
      at: Date.now(),
    }),
    click: async () => ({ ok: true as const, action: 'click', detail: 'ok', url: 'https://example.com', title: 'Example' }),
    type: async () => ({ ok: true as const, action: 'type', detail: 'ok', url: 'https://example.com', title: 'Example' }),
    scroll: async () => ({ ok: true as const, action: 'scroll', detail: 'ok', url: 'https://example.com', title: 'Example' }),
    navigate: async (options: { url: string }) => ({
      ok: true as const,
      action: 'navigate',
      detail: options.url,
      url: options.url,
      title: '',
    }),
  };
}
