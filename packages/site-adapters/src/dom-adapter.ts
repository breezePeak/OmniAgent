import type { AdapterHealthStatus, ConversationTurn } from '@omni-agent/shared';
import { ResponseObserver } from './response-observer.js';
import type { ModelResponse, ObservedMessage, SiteAdapter } from './index.js';

export interface DomAdapterOptions {
  id: string;
  hosts: readonly string[];
  inputSelectors: readonly string[];
  submitSelectors: readonly string[];
  messageSelectors: readonly string[];
  responseSelectors: readonly string[];
  getConversationId?: (url: URL) => string | null;
}

export class DomSiteAdapter implements SiteAdapter {
  readonly id: string;
  private readonly toolStatuses = new Map<string, string>();

  constructor(private readonly options: DomAdapterOptions) {
    this.id = options.id;
  }

  match(url: string): boolean {
    try {
      return this.options.hosts.some((host) => new URL(url).hostname === host);
    } catch {
      return false;
    }
  }

  async sendMessage(message: string): Promise<void> {
    const input = this.findElement<HTMLElement>(this.options.inputSelectors);
    if (!input) throw new Error(`${this.id}: message input was not found`);
    try {
      await this.insertPrompt(message);
      const submit = await this.waitForEnabledSubmit(input);
      if (!submit) throw new Error(`${this.id}: send button was not found or did not become enabled`);
      submit.click();
    } catch (error) {
      // Internal protocol messages are transport only. Never leave one exposed
      // in the provider composer when a site changes its send-button DOM.
      this.clearInternalPrompt(input, message);
      throw error;
    }
  }

  async insertPrompt(message: string): Promise<void> {
    if (!message) throw new Error(`${this.id}: prompt is empty`);
    const input = this.findElement<HTMLElement>(this.options.inputSelectors);
    if (!input) throw new Error(`${this.id}: message input was not found`);

    const current = readInputText(input);
    if (sameComposerText(current, message)) {
      input.focus();
      return;
    }
    if (current.trim()) {
      throw new Error(`${this.id}: message input is not empty; clear the existing draft before inserting a new prompt`);
    }

    input.focus();
    writeInputText(input, message);
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: message }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.focus();
    await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
    if (!sameComposerText(readInputText(input), message)) {
      throw new Error(`${this.id}: message input rejected the inserted prompt`);
    }
  }

  hideInternalProtocolMessages(): void {
    for (const element of this.messageElements()) {
      const message = this.readMessage(element);
      const status = message?.role === 'assistant' ? this.toolStatuses.get(message.id) : undefined;
      if (status) this.replaceMessage(element, status);
    }
    for (const element of this.internalProtocolMessages()) {
      const messageId = this.readMessage(element)?.id;
      const status = messageId ? this.toolStatuses.get(messageId) : undefined;
      if (status) {
        this.replaceMessage(element, status);
        continue;
      }
      element.setAttribute('data-omniagent-internal', 'true');
      (element as HTMLElement).style.setProperty('display', 'none', 'important');
    }
  }

  inspectHealth(): AdapterHealthStatus {
    const input = this.findElement<HTMLElement>(this.options.inputSelectors);
    const submit = input
      ? this.findSubmitNearInput(input) ?? this.findElement<HTMLElement>(this.options.submitSelectors)
      : this.findElement<HTMLElement>(this.options.submitSelectors);
    const messages = this.messageElements()
      .map((element) => this.readMessage(element))
      .filter((message): message is ObservedMessage => message !== null);
    return {
      contentScript: true,
      inputFound: Boolean(input),
      submitFound: Boolean(submit),
      submitEnabled: Boolean(submit && !isDisabled(submit)),
      messageCount: messages.filter((message) => message.role === 'user').length,
      responseCount: messages.filter((message) => message.role === 'assistant').length,
      checkedAt: Date.now(),
    };
  }

  renderToolStatus(messageId: string, text: string): boolean {
    const exact = this.messageElements().find((element) => {
      const message = this.readMessage(element);
      return message?.role === 'assistant' && message.id === messageId;
    });
    const target = exact ?? this.internalProtocolMessages().at(-1);
    if (!target || !text.trim()) return false;
    this.toolStatuses.set(messageId, text.trim());
    if (this.toolStatuses.size > 100) this.toolStatuses.delete(this.toolStatuses.keys().next().value!);
    this.replaceMessage(target, text.trim());
    return true;
  }

  private replaceMessage(target: Element, text: string): void {
    const content = this.findResponseHost(target) ?? target;
    if (content.textContent?.trim() !== text) content.textContent = text;
    for (const element of new Set([target, content])) {
      element.removeAttribute('data-omniagent-internal');
      (element as HTMLElement).style.removeProperty('display');
    }
  }

  getLatestTurn(): ConversationTurn {
    const turn: ConversationTurn = { question: '', response: '' };
    this.readMessages().forEach((message) => {
      if (message.role === 'user') {
        turn.question = message.text;
        turn.response = '';
      } else {
        turn.response = message.text;
      }
    });
    return turn;
  }

  observeMessages(callback: (message: ObservedMessage) => void): () => void {
    const previousText = new WeakMap<Element, string>();
    const emitMessages = () => {
      document.querySelectorAll(this.options.messageSelectors.join(',')).forEach((element) => {
        const message = this.readMessage(element);
        if (message?.text && previousText.get(element) !== message.text) {
          previousText.set(element, message.text);
          callback(message);
        }
      });
    };
    emitMessages();
    const observer = new MutationObserver(emitMessages);
    observer.observe(document, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => observer.disconnect();
  }

  observeResponse(callback: (response: ModelResponse) => void): () => void {
    const responseObserver = new ResponseObserver(callback, {
      getConversationId: () => this.getConversationId(),
    });
    const stopMessages = this.observeMessages((message) => responseObserver.observe(message));
    return () => {
      stopMessages();
      responseObserver.dispose();
    };
  }

  getConversationId(url = window.location.href): string | null {
    return this.options.getConversationId?.(new URL(url)) ?? null;
  }

  private readMessages(): ObservedMessage[] {
    return Array.from(document.querySelectorAll(this.options.messageSelectors.join(',')))
      .map((element) => this.readMessage(element))
      .filter((message): message is ObservedMessage => message !== null);
  }

  private readMessage(element: Element): ObservedMessage | null {
    const responseHost = this.findResponseHost(element);
    const text = (responseHost ?? element).textContent?.trim();
    if (!text) return null;
    const role = responseHost ? 'assistant' : 'user';
    const id = this.findMessageId(element, responseHost) ?? `${role}:${text}`;
    return { id, role, text };
  }

  private internalProtocolMessages(): Element[] {
    const marked = this.messageElements()
      .filter((element) => /<omniagent-(?:action|tool-result)\b/iu.test(element.textContent ?? ''));
    return marked.filter((element) => !marked.some((candidate) => candidate !== element && element.contains(candidate)));
  }

  private messageElements(): Element[] {
    return Array.from(document.querySelectorAll(this.options.messageSelectors.join(',')));
  }

  private findResponseHost(element: Element): Element | undefined {
    return Array.from(element.querySelectorAll(this.options.responseSelectors.join(',')))
      .filter((host) => !host.parentElement?.closest(this.options.responseSelectors.join(',')))
      .at(-1);
  }

  private findMessageId(message: Element, responseHost?: Element): string | null {
    const candidates = [
      message,
      responseHost,
      ...Array.from(message.querySelectorAll('[data-message-id], [data-messageid], [data-id], [data-ds-message-id], [id]')),
    ].filter((element): element is Element => Boolean(element));
    for (const element of candidates) {
      const value = element.getAttribute('data-message-id')
        ?? element.getAttribute('data-messageid')
        ?? element.getAttribute('data-ds-message-id')
        ?? element.getAttribute('data-id');
      if (value) return value;
    }
    return null;
  }

  private findElement<T extends Element>(selectors: readonly string[]): T | null {
    for (const selector of selectors) {
      const element = document.querySelector<T>(selector);
      if (element) return element;
    }
    return null;
  }

  private async waitForEnabledSubmit(input: HTMLElement): Promise<HTMLElement | null> {
    const deadline = Date.now() + 1_000;
    while (Date.now() < deadline) {
      const submit = this.findSubmitNearInput(input) ?? this.findElement<HTMLElement>(this.options.submitSelectors);
      if (submit && !isDisabled(submit)) return submit;
      await new Promise<void>((resolve) => window.setTimeout(resolve, 16));
    }
    return null;
  }

  private findSubmitNearInput(input: HTMLElement): HTMLElement | null {
    const selectors = [...this.options.submitSelectors, '[role="button"][aria-label*="发送"]', '[role="button"][aria-label*="Send"]', '[role="button"][class*="send"]', '[role="button"][class*="submit"]'];
    let container: HTMLElement | null = input;
    for (let depth = 0; container && depth < 6; depth += 1, container = container.parentElement) {
      for (const selector of selectors) {
        const submit = container.querySelector<HTMLElement>(selector);
        if (submit) return submit;
      }
    }
    return null;
  }

  private clearInternalPrompt(input: HTMLElement, message: string): void {
    const current = readInputText(input);
    if (current !== message || !/<omniagent-(?:action|tool-result)\b/iu.test(message)) return;
    writeInputText(input, '');
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward', data: null }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function isTextControl(element: HTMLElement): element is HTMLTextAreaElement | HTMLInputElement {
  return (typeof HTMLTextAreaElement !== 'undefined' && element instanceof HTMLTextAreaElement)
    || (typeof HTMLInputElement !== 'undefined' && element instanceof HTMLInputElement);
}

function readInputText(input: HTMLElement): string {
  return isTextControl(input) ? input.value : input.textContent ?? '';
}

function writeInputText(input: HTMLElement, value: string): void {
  if (!isTextControl(input)) {
    input.textContent = value;
    return;
  }

  const prototype = typeof HTMLTextAreaElement !== 'undefined' && input instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (setter) setter.call(input, value);
  else input.value = value;
}

function sameComposerText(actual: string, expected: string): boolean {
  const normalize = (value: string) => value.replace(/\u00a0/gu, ' ').replace(/\r\n?/gu, '\n').trim();
  return normalize(actual) === normalize(expected);
}

function isDisabled(element: HTMLElement): boolean {
  return typeof HTMLButtonElement !== 'undefined' && element instanceof HTMLButtonElement
    ? element.disabled
    : element.getAttribute('aria-disabled') === 'true' || element.hasAttribute('disabled');
}
