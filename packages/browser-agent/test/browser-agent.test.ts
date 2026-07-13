import assert from 'node:assert/strict';
import test from 'node:test';
import { BrowserPageController, normalizeNavigateUrl, normalizeText } from '../src/index.js';

test('normalizes navigation urls and rejects non-http schemes', () => {
  assert.equal(normalizeNavigateUrl('https://github.com/search'), 'https://github.com/search');
  assert.equal(normalizeNavigateUrl('example.com'), 'https://example.com/');
  assert.throws(() => normalizeNavigateUrl('javascript:alert(1)'), /http\/https/);
  assert.throws(() => normalizeNavigateUrl(''), /required/);
});

test('normalizes page text for snapshots', () => {
  assert.equal(normalizeText('a  \n\n\nb'), 'a\n\nb');
});

test('page controller can snapshot, click, type and scroll with a minimal DOM', () => {
  const { document, window } = createMiniDom();
  const controller = new BrowserPageController(document, window);

  const snapshot = controller.snapshot({ maxLength: 100 });
  assert.equal(snapshot.title, 'Demo');
  assert.match(snapshot.text, /Hello/);

  const click = controller.click({ selector: '#go' });
  assert.equal(click.ok, true);
  assert.equal(document.querySelector('#go')?.getAttribute('data-clicked'), '1');

  const typed = controller.type({ selector: '#q', value: 'OmniAgent', clear: true });
  assert.equal(typed.ok, true);
  assert.equal((document.querySelector('#q') as { value: string }).value, 'OmniAgent');

  const scrolled = controller.scroll({ direction: 'down', amount: 120 });
  assert.equal(scrolled.ok, true);
  assert.equal(window.scrollY, 120);
});

function createMiniDom(): { document: Document; window: Window } {
  const listeners = new Map<Element, Map<string, Array<(event: Event) => void>>>();

  class MiniEvent {
    bubbles: boolean;
    constructor(public type: string, init?: { bubbles?: boolean }) {
      this.bubbles = Boolean(init?.bubbles);
    }
  }

  class MiniElement {
    tagName: string;
    id = '';
    className = '';
    textContent = '';
    isContentEditable = false;
    attributes = new Map<string, string>();
    children: MiniElement[] = [];
    parentElement: MiniElement | null = null;
    value = '';
    placeholder = '';
    form: { requestSubmit?: () => void } | null = null;
    scrollLeft = 0;
    scrollTop = 0;

    constructor(tagName: string) {
      this.tagName = tagName.toUpperCase();
    }

    getAttribute(name: string) {
      return this.attributes.get(name) ?? null;
    }

    setAttribute(name: string, value: string) {
      this.attributes.set(name, value);
      if (name === 'id') this.id = value;
      if (name === 'class') this.className = value;
    }

    appendChild(child: MiniElement) {
      child.parentElement = this;
      this.children.push(child);
      return child;
    }

    focus() {}

    click() {
      this.dispatchEvent(new MiniEvent('click', { bubbles: true }) as unknown as Event);
      this.setAttribute('data-clicked', '1');
    }

    scrollIntoView() {}

    scrollBy(init: { left?: number; top?: number }) {
      this.scrollLeft += init.left ?? 0;
      this.scrollTop += init.top ?? 0;
    }

    addEventListener(type: string, handler: (event: Event) => void) {
      const byType = listeners.get(this as unknown as Element) ?? new Map();
      listeners.set(this as unknown as Element, byType);
      const list = byType.get(type) ?? [];
      list.push(handler);
      byType.set(type, list);
    }

    dispatchEvent(event: Event) {
      const byType = listeners.get(this as unknown as Element);
      byType?.get(event.type)?.forEach((handler) => handler(event));
      return true;
    }

    querySelector(selector: string): MiniElement | null {
      return query(this, selector);
    }

    querySelectorAll(selector: string): MiniElement[] {
      const matches: MiniElement[] = [];
      walk(this, (node) => {
        if (matchesSelector(node, selector)) matches.push(node);
      });
      return matches;
    }
  }

  class MiniInput extends MiniElement {
    constructor() {
      super('input');
    }
  }

  class MiniTextArea extends MiniElement {
    constructor() {
      super('textarea');
    }
  }

  const body = new MiniElement('body');
  Object.defineProperty(body, 'innerText', {
    get() {
      return 'Hello OmniAgent';
    },
  });
  body.textContent = 'Hello OmniAgent';
  const button = new MiniElement('button');
  button.setAttribute('id', 'go');
  button.textContent = 'Search';
  const input = new MiniInput();
  input.setAttribute('id', 'q');
  body.appendChild(button);
  body.appendChild(input);

  const documentElement = new MiniElement('html');
  Object.defineProperty(documentElement, 'innerText', {
    get() {
      return 'Hello OmniAgent';
    },
  });
  documentElement.appendChild(body);

  const document = {
    title: 'Demo',
    body,
    documentElement,
    querySelector: (selector: string) => query(documentElement, selector),
    querySelectorAll: (selector: string) => documentElement.querySelectorAll(selector),
  } as unknown as Document;

  let scrollY = 0;
  const window = {
    location: { href: 'https://example.com/' },
    getSelection: () => ({ toString: () => '' }),
    scrollBy: ({ top = 0 }: { left?: number; top?: number }) => {
      scrollY += top;
    },
    get scrollY() {
      return scrollY;
    },
  } as unknown as Window;

  // Patch global constructors used by controller for input typing.
  (globalThis as { HTMLElement: unknown }).HTMLElement = MiniElement;
  (globalThis as { HTMLInputElement: unknown }).HTMLInputElement = MiniInput;
  (globalThis as { HTMLTextAreaElement: unknown }).HTMLTextAreaElement = MiniTextArea;
  (globalThis as { InputEvent: unknown }).InputEvent = MiniEvent;
  (globalThis as { Event: unknown }).Event = MiniEvent;
  (globalThis as { KeyboardEvent: unknown }).KeyboardEvent = MiniEvent;
  Object.defineProperty(MiniInput.prototype, 'value', {
    get() {
      return (this as MiniInput).value;
    },
    set(next: string) {
      (this as MiniInput).value = next;
    },
    configurable: true,
  });

  return { document, window };

  function walk(node: MiniElement, visit: (node: MiniElement) => void) {
    visit(node);
    node.children.forEach((child) => walk(child, visit));
  }

  function query(root: MiniElement, selector: string): MiniElement | null {
    let found: MiniElement | null = null;
    walk(root, (node) => {
      if (!found && matchesSelector(node, selector)) found = node;
    });
    return found;
  }

  function matchesSelector(node: MiniElement, selector: string): boolean {
    if (selector.startsWith('#')) return node.id === selector.slice(1);
    if (selector.includes(',')) return selector.split(',').some((part) => matchesSelector(node, part.trim()));
    if (selector.startsWith('[') && selector.endsWith(']')) {
      // minimal attribute support unused in this test
      return false;
    }
    return node.tagName.toLowerCase() === selector.toLowerCase();
  }
}
