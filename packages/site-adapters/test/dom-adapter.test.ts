import assert from 'node:assert/strict';
import test from 'node:test';
import { DomSiteAdapter } from '../src/dom-adapter.js';
import { kimiAdapter } from '../src/kimi.js';

class FakeStyle {
  private readonly values = new Map<string, string>();
  setProperty(name: string, value: string): void { this.values.set(name, value); }
  removeProperty(name: string): string { const value = this.values.get(name) ?? ''; this.values.delete(name); return value; }
  get(name: string): string | undefined { return this.values.get(name); }
}

class FakeElement {
  private ownText = '';
  parentElement: FakeElement | null = null;
  readonly style = new FakeStyle();
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];

  get textContent(): string { return this.ownText || this.children.map((child) => child.textContent).join(''); }
  set textContent(value: string) { this.ownText = value; }

  append(child: FakeElement): void { child.parentElement = this; this.children.push(child); }
  contains(candidate: FakeElement): boolean { return candidate === this || this.children.some((child) => child.contains(candidate)); }
  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
  hasAttribute(name: string): boolean { return this.attributes.has(name); }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  removeAttribute(name: string): void { this.attributes.delete(name); }
  closest(): FakeElement | null { return null; }
  querySelector(): FakeElement | null { return null; }
  querySelectorAll(selector: string): FakeElement[] {
    if (selector === '.assistant') return this.children;
    return [];
  }
  focus(): void {}
  dispatchEvent(): boolean { return true; }
}

test('turns a hidden tool action into a visible result in the same response', () => {
  const message = new FakeElement();
  message.setAttribute('data-message-id', 'assistant-1');
  const response = new FakeElement();
  response.textContent = '<omniagent-action>{"type":"tool_call"}</omniagent-action>';
  message.append(response);
  const originalDocument = globalThis.document;
  (globalThis as { document: unknown }).document = {
    querySelectorAll: (selector: string) => selector === '.message' ? [message] : [],
  };

  try {
    const adapter = new DomSiteAdapter({
      id: 'test', hosts: ['example.com'], inputSelectors: [], submitSelectors: [],
      messageSelectors: ['.message'], responseSelectors: ['.assistant'],
    });
    adapter.hideInternalProtocolMessages();
    assert.equal(message.style.get('display'), 'none');
    assert.equal(adapter.renderToolStatus('assistant-1', '记忆处理完成：已保存 1 条。'), true);
    assert.equal(response.textContent, '记忆处理完成：已保存 1 条。');
    assert.equal(message.style.get('display'), undefined);
    assert.equal(message.getAttribute('data-omniagent-internal'), null);

    response.textContent = '<omniagent-action>{"type":"tool_call"}</omniagent-action>';
    adapter.hideInternalProtocolMessages();
    assert.equal(response.textContent, '记忆处理完成：已保存 1 条。');
    assert.equal(message.style.get('display'), undefined);
  } finally {
    (globalThis as { document: unknown }).document = originalDocument;
  }
});

test('replaces a natural-language save claim with the verified local result', () => {
  const message = new FakeElement();
  message.setAttribute('data-message-id', 'assistant-2');
  const response = new FakeElement();
  response.textContent = '好的，我已经记住了。';
  message.append(response);
  const originalDocument = globalThis.document;
  (globalThis as { document: unknown }).document = {
    querySelectorAll: (selector: string) => selector === '.message' ? [message] : [],
  };

  try {
    const adapter = new DomSiteAdapter({
      id: 'test', hosts: ['example.com'], inputSelectors: [], submitSelectors: [],
      messageSelectors: ['.message'], responseSelectors: ['.assistant'],
    });
    assert.equal(adapter.renderToolStatus('assistant-2', '记忆处理完成：已保存 1 条。'), true);
    assert.equal(response.textContent, '记忆处理完成：已保存 1 条。');
  } finally {
    (globalThis as { document: unknown }).document = originalDocument;
  }
});

test('reports actionable DOM adapter health checks', () => {
  const input = new FakeElement();
  const submit = new FakeElement();
  const message = new FakeElement();
  message.setAttribute('data-message-id', 'assistant-health');
  const response = new FakeElement();
  response.textContent = '已连接';
  message.append(response);
  const originalDocument = globalThis.document;
  (globalThis as { document: unknown }).document = {
    querySelector: (selector: string) => selector === '.input' ? input : selector === '.submit' ? submit : null,
    querySelectorAll: (selector: string) => selector === '.message' ? [message] : [],
  };

  try {
    const adapter = new DomSiteAdapter({
      id: 'test', hosts: ['example.com'], inputSelectors: ['.input'], submitSelectors: ['.submit'],
      messageSelectors: ['.message'], responseSelectors: ['.assistant'],
    });
    const health = adapter.inspectHealth();
    assert.equal(health.contentScript, true);
    assert.equal(health.inputFound, true);
    assert.equal(health.submitFound, true);
    assert.equal(health.submitEnabled, true);
    assert.equal(health.messageCount, 0);
    assert.equal(health.responseCount, 1);
  } finally {
    (globalThis as { document: unknown }).document = originalDocument;
  }
});

test('recognizes the current Kimi div-based send control', () => {
  const input = new FakeElement();
  const submit = new FakeElement();
  const originalDocument = globalThis.document;
  (globalThis as { document: unknown }).document = {
    querySelector: (selector: string) => {
      if (selector === '[contenteditable="true"][role="textbox"]') return input;
      if (selector === '.send-button-container') return submit;
      return null;
    },
    querySelectorAll: () => [],
  };

  try {
    const health = kimiAdapter.inspectHealth();
    assert.equal(health.inputFound, true);
    assert.equal(health.submitFound, true);
    assert.equal(health.submitEnabled, true);
  } finally {
    (globalThis as { document: unknown }).document = originalDocument;
  }
});

test('refuses to overwrite a non-empty provider draft', async () => {
  const input = new FakeElement();
  input.textContent = '用户尚未发送的草稿';
  const submit = new FakeElement();
  const originalDocument = globalThis.document;
  (globalThis as { document: unknown }).document = {
    querySelector: (selector: string) => selector === '.input' ? input : selector === '.submit' ? submit : null,
    querySelectorAll: () => [],
  };

  try {
    const adapter = new DomSiteAdapter({
      id: 'test', hosts: ['example.com'], inputSelectors: ['.input'], submitSelectors: ['.submit'],
      messageSelectors: [], responseSelectors: [],
    });
    await assert.rejects(
      () => adapter.sendMessage('新的 OmniAgent 消息'),
      /message input is not empty/,
    );
    assert.equal(input.textContent, '用户尚未发送的草稿');
  } finally {
    (globalThis as { document: unknown }).document = originalDocument;
  }
});
