import {
  MEMORY_SAVE_TYPES,
  type MemorySaveBatchItem,
  type MemorySaveType,
  type ToolDefinition,
} from './types.js';

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

export const memorySaveBatchTool: ToolDefinition = {
  name: 'memory.save_batch',
  description: 'Save a source-verified batch of curated long-term memories in one operation. Every item must contain content, exact sourceQuotes copied from the current conversation, and their sourceMessageIds; type and importance (0-1) are optional.',
  source: 'builtin',
  permissions: ['memory.write'],
  parameters: [
    {
      name: 'items',
      type: 'array',
      description: 'Memory items: [{content, type?, importance?, sourceQuotes, sourceMessageIds}]. sourceQuotes and sourceMessageIds must be non-empty arrays of strings.',
      required: true,
    },
  ],
  async execute(input, context) {
    if (!context.services.memory) throw new Error('Memory service is unavailable');
    if (!Array.isArray(input.items) || !input.items.length) throw new Error('items must be a non-empty array');
    const items: MemorySaveBatchItem[] = [];
    const originalIndexes: number[] = [];
    const schemaRejections: BatchToolItemResult[] = [];
    for (const [index, item] of input.items.entries()) {
      try {
        items.push(readBatchItem(item, index));
        originalIndexes.push(index);
      } catch (error) {
        schemaRejections.push({
          itemIndex: index,
          chunkIndex: null,
          status: 'rejected_schema',
          factId: null,
          candidateId: null,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
    const serviceResult = items.length
      ? await context.services.memory.saveBatch(items)
      : { saved: 0, candidates: 0, rejected: 0, items: [] };
    return mergeBatchToolResult(serviceResult, originalIndexes, schemaRejections);
  },
};

interface BatchToolItemResult {
  itemIndex: number;
  chunkIndex: number | null;
  status: string;
  factId: string | null;
  candidateId: string | null;
  reason?: string;
}

function readBatchItem(item: unknown, index: number): MemorySaveBatchItem {
  const label = `items[${index}]`;
  if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`${label} must be an object`);
  const value = item as Record<string, unknown>;
  if (typeof value.content !== 'string' || !value.content.trim()) throw new Error(`${label}.content must be a non-empty string`);
  if (value.type !== undefined && !isMemorySaveType(value.type)) {
    throw new Error(`${label}.type must be one of: ${MEMORY_SAVE_TYPES.join(', ')}`);
  }
  if (value.importance !== undefined && (
    typeof value.importance !== 'number'
    || !Number.isFinite(value.importance)
    || value.importance < 0
    || value.importance > 1
  )) {
    throw new Error(`${label}.importance must be a finite number between 0 and 1`);
  }
  return {
    content: value.content.trim(),
    type: value.type as MemorySaveType | undefined,
    importance: typeof value.importance === 'number' ? value.importance : undefined,
    sourceQuotes: readEvidenceList(value.sourceQuotes, `${label}.sourceQuotes`),
    sourceMessageIds: readEvidenceList(value.sourceMessageIds, `${label}.sourceMessageIds`),
  };
}

function mergeBatchToolResult(
  value: unknown,
  originalIndexes: number[],
  schemaRejections: BatchToolItemResult[],
): { saved: number; candidates: number; rejected: number; items: BatchToolItemResult[] } {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  const serviceItems = Array.isArray(record?.items)
    ? record.items.map((item, fallbackIndex): BatchToolItemResult => {
      const source = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      const serviceIndex = typeof source.itemIndex === 'number' ? source.itemIndex : fallbackIndex;
      return {
        itemIndex: originalIndexes[serviceIndex] ?? serviceIndex,
        chunkIndex: typeof source.chunkIndex === 'number' ? source.chunkIndex : null,
        status: typeof source.status === 'string' ? source.status : 'processed',
        factId: typeof source.factId === 'string' ? source.factId : null,
        candidateId: typeof source.candidateId === 'string' ? source.candidateId : null,
        reason: typeof source.reason === 'string' ? source.reason : undefined,
      };
    })
    : originalIndexes.map((itemIndex) => ({
      itemIndex,
      chunkIndex: null,
      status: 'processed',
      factId: null,
      candidateId: null,
    }));
  const result = {
    saved: typeof record?.saved === 'number' ? record.saved : originalIndexes.length,
    candidates: typeof record?.candidates === 'number' ? record.candidates : 0,
    rejected: (typeof record?.rejected === 'number' ? record.rejected : 0) + schemaRejections.length,
    items: [...serviceItems, ...schemaRejections].sort((left, right) => left.itemIndex - right.itemIndex),
  };
  return result;
}

function isMemorySaveType(value: unknown): value is MemorySaveType {
  return typeof value === 'string' && (MEMORY_SAVE_TYPES as readonly string[]).includes(value);
}

function readEvidenceList(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.length) throw new Error(`${label} must be a non-empty array of strings`);
  const normalized = value.map((entry) => {
    if (typeof entry !== 'string' || !entry.trim()) throw new Error(`${label} must contain only non-empty strings`);
    return entry.trim();
  });
  return [...new Set(normalized)];
}

export const browserSnapshotTool: ToolDefinition = {
  name: 'browser.snapshot',
  description: 'Capture the active browser tab title, URL, text, and interactive element refs.',
  source: 'browser',
  permissions: ['browser.read'],
  parameters: [
    { name: 'includeText', type: 'boolean', description: 'Include page text', required: false },
    { name: 'maxLength', type: 'number', description: 'Max text length', required: false },
    { name: 'includeElements', type: 'boolean', description: 'Include interactive element refs', required: false },
    { name: 'maxElements', type: 'number', description: 'Max interactive elements', required: false },
  ],
  async execute(input, context) {
    if (!context.services.browser) throw new Error('Browser service is unavailable');
    return context.services.browser.snapshot({
      includeText: input.includeText !== false,
      maxLength: typeof input.maxLength === 'number' ? input.maxLength : 4_000,
      includeElements: input.includeElements !== false,
      maxElements: typeof input.maxElements === 'number' ? input.maxElements : 40,
    });
  },
};

export const browserClickTool: ToolDefinition = {
  name: 'browser.click',
  description: 'Click an element on the active page by ref, CSS selector, or visible text.',
  source: 'browser',
  permissions: ['browser.act'],
  parameters: [
    { name: 'ref', type: 'string', description: 'Element ref from browser.snapshot', required: false },
    { name: 'selector', type: 'string', description: 'CSS selector', required: false },
    { name: 'text', type: 'string', description: 'Visible text', required: false },
    { name: 'exact', type: 'boolean', description: 'Exact text match', required: false },
  ],
  async execute(input, context) {
    if (!context.services.browser?.click) throw new Error('Browser click is unavailable');
    return context.services.browser.click({
      ref: typeof input.ref === 'string' ? input.ref : undefined,
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
    { name: 'ref', type: 'string', description: 'Element ref from browser.snapshot', required: false },
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
      ref: typeof input.ref === 'string' ? input.ref : undefined,
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
  memorySaveBatchTool,
  browserSnapshotTool,
  browserClickTool,
  browserTypeTool,
  browserScrollTool,
  browserNavigateTool,
];
