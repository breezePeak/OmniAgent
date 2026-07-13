import type { ToolDefinition } from './types.js';

export const memorySearchTool: ToolDefinition = {
  name: 'memory.search',
  description: 'Search OmniAgent long-term memories by natural language query.',
  source: 'builtin',
  permissions: ['memory.read'],
  parameters: [
    { name: 'query', type: 'string', description: 'Search query', required: true },
    { name: 'limit', type: 'number', description: 'Max results', required: false },
  ],
  async execute(input, context) {
    if (!context.services.memory) throw new Error('Memory service is unavailable');
    const query = String(input.query ?? '').trim();
    if (!query) throw new Error('query is required');
    const limit = typeof input.limit === 'number' ? input.limit : 8;
    return context.services.memory.search(query, {
      providerId: context.providerId ?? undefined,
      projectId: context.projectId ?? undefined,
      limit,
    });
  },
};

export const memorySaveTool: ToolDefinition = {
  name: 'memory.save',
  description: 'Save a long-term memory entry for later cross-provider retrieval.',
  source: 'builtin',
  permissions: ['memory.write'],
  parameters: [
    { name: 'content', type: 'string', description: 'Memory content', required: true },
    { name: 'type', type: 'string', description: 'Memory type', required: false },
    { name: 'importance', type: 'number', description: 'Importance 0-1', required: false },
  ],
  async execute(input, context) {
    if (!context.services.memory) throw new Error('Memory service is unavailable');
    const content = String(input.content ?? '').trim();
    if (!content) throw new Error('content is required');
    return context.services.memory.save({
      content,
      type: typeof input.type === 'string' ? input.type : 'knowledge',
      importance: typeof input.importance === 'number' ? input.importance : 0.7,
    });
  },
};

export const browserSnapshotTool: ToolDefinition = {
  name: 'browser.snapshot',
  description: 'Capture the active browser tab title, URL, and visible text snapshot.',
  source: 'browser',
  permissions: ['browser.read'],
  parameters: [
    { name: 'includeText', type: 'boolean', description: 'Include page text', required: false },
    { name: 'maxLength', type: 'number', description: 'Max text length', required: false },
  ],
  async execute(input, context) {
    if (!context.services.browser) throw new Error('Browser service is unavailable');
    return context.services.browser.snapshot({
      includeText: input.includeText !== false,
      maxLength: typeof input.maxLength === 'number' ? input.maxLength : 4_000,
    });
  },
};

export const browserClickTool: ToolDefinition = {
  name: 'browser.click',
  description: 'Click an element on the active page by CSS selector or visible text.',
  source: 'browser',
  permissions: ['browser.act'],
  parameters: [
    { name: 'selector', type: 'string', description: 'CSS selector', required: false },
    { name: 'text', type: 'string', description: 'Visible text', required: false },
    { name: 'exact', type: 'boolean', description: 'Exact text match', required: false },
  ],
  async execute(input, context) {
    if (!context.services.browser?.click) throw new Error('Browser click is unavailable');
    return context.services.browser.click({
      selector: typeof input.selector === 'string' ? input.selector : undefined,
      text: typeof input.text === 'string' ? input.text : undefined,
      exact: input.exact === true,
    });
  },
};

export const browserTypeTool: ToolDefinition = {
  name: 'browser.type',
  description: 'Type text into an input/textarea/contenteditable element on the active page.',
  source: 'browser',
  permissions: ['browser.act'],
  parameters: [
    { name: 'selector', type: 'string', description: 'CSS selector', required: false },
    { name: 'text', type: 'string', description: 'Visible label/text for target', required: false },
    { name: 'value', type: 'string', description: 'Text to type', required: true },
    { name: 'clear', type: 'boolean', description: 'Clear existing value first', required: false },
    { name: 'submit', type: 'boolean', description: 'Submit form after typing', required: false },
  ],
  async execute(input, context) {
    if (!context.services.browser?.type) throw new Error('Browser type is unavailable');
    const value = String(input.value ?? '');
    return context.services.browser.type({
      selector: typeof input.selector === 'string' ? input.selector : undefined,
      text: typeof input.text === 'string' ? input.text : undefined,
      value,
      clear: input.clear !== false,
      submit: input.submit === true,
    });
  },
};

export const browserScrollTool: ToolDefinition = {
  name: 'browser.scroll',
  description: 'Scroll the active page or a specific container.',
  source: 'browser',
  permissions: ['browser.act'],
  parameters: [
    { name: 'direction', type: 'string', description: 'up|down|left|right', required: false },
    { name: 'amount', type: 'number', description: 'Pixels to scroll', required: false },
    { name: 'selector', type: 'string', description: 'Optional container selector', required: false },
  ],
  async execute(input, context) {
    if (!context.services.browser?.scroll) throw new Error('Browser scroll is unavailable');
    const direction = typeof input.direction === 'string' ? input.direction : 'down';
    if (!['up', 'down', 'left', 'right'].includes(direction)) {
      throw new Error('direction must be up|down|left|right');
    }
    return context.services.browser.scroll({
      direction: direction as 'up' | 'down' | 'left' | 'right',
      amount: typeof input.amount === 'number' ? input.amount : 600,
      selector: typeof input.selector === 'string' ? input.selector : undefined,
    });
  },
};

export const browserNavigateTool: ToolDefinition = {
  name: 'browser.navigate',
  description: 'Navigate the active browser tab to an http(s) URL.',
  source: 'browser',
  permissions: ['browser.navigate'],
  parameters: [
    { name: 'url', type: 'string', description: 'Target URL', required: true },
  ],
  async execute(input, context) {
    if (!context.services.browser?.navigate) throw new Error('Browser navigate is unavailable');
    const url = String(input.url ?? '').trim();
    if (!url) throw new Error('url is required');
    return context.services.browser.navigate({ url });
  },
};

export const builtinTools: readonly ToolDefinition[] = [
  memorySearchTool,
  memorySaveTool,
  browserSnapshotTool,
  browserClickTool,
  browserTypeTool,
  browserScrollTool,
  browserNavigateTool,
];
