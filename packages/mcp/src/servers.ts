import type { McpServer, McpToolCall, McpToolDefinition, McpToolResult } from './types.js';

export function createEchoServer(): McpServer {
  return {
    info: {
      id: 'echo',
      name: 'Echo MCP',
      version: '1.0.0',
      description: 'Simple echo server for validating MCP plumbing.',
    },
    async listTools(): Promise<McpToolDefinition[]> {
      return [
        {
          name: 'echo',
          description: 'Echo back the provided message.',
          parameters: [{ name: 'message', type: 'string', description: 'Message to echo', required: true }],
        },
      ];
    },
    async callTool(call: McpToolCall): Promise<McpToolResult> {
      if (call.name !== 'echo') return { ok: false, content: null, error: `Unknown tool: ${call.name}` };
      const message = String(call.arguments?.message ?? '').trim();
      if (!message) return { ok: false, content: null, error: 'message is required' };
      return { ok: true, content: { message } };
    },
  };
}

export function createMemoryNotesServer(store: Map<string, string> = new Map()): McpServer {
  return {
    info: {
      id: 'memory-notes',
      name: 'Memory Notes MCP',
      version: '1.0.0',
      description: 'In-memory note storage exposed through MCP tool contracts.',
    },
    async listTools(): Promise<McpToolDefinition[]> {
      return [
        {
          name: 'notes.write',
          description: 'Write a named note.',
          parameters: [
            { name: 'key', type: 'string', description: 'Note key', required: true },
            { name: 'value', type: 'string', description: 'Note content', required: true },
          ],
        },
        {
          name: 'notes.read',
          description: 'Read a named note.',
          parameters: [{ name: 'key', type: 'string', description: 'Note key', required: true }],
        },
        {
          name: 'notes.list',
          description: 'List all note keys.',
          parameters: [],
        },
      ];
    },
    async callTool(call: McpToolCall): Promise<McpToolResult> {
      if (call.name === 'notes.write') {
        const key = String(call.arguments?.key ?? '').trim();
        const value = String(call.arguments?.value ?? '');
        if (!key) return { ok: false, content: null, error: 'key is required' };
        store.set(key, value);
        return { ok: true, content: { key, value } };
      }
      if (call.name === 'notes.read') {
        const key = String(call.arguments?.key ?? '').trim();
        if (!key) return { ok: false, content: null, error: 'key is required' };
        if (!store.has(key)) return { ok: false, content: null, error: `Note not found: ${key}` };
        return { ok: true, content: { key, value: store.get(key) } };
      }
      if (call.name === 'notes.list') {
        return { ok: true, content: { keys: [...store.keys()].sort() } };
      }
      return { ok: false, content: null, error: `Unknown tool: ${call.name}` };
    },
  };
}

export function createHttpMcpServer(input: {
  id: string;
  name: string;
  endpoint: string;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
}): McpServer {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!fetchImpl) {
    return {
      info: {
        id: input.id,
        name: input.name,
        version: '0.0.0',
        description: 'HTTP MCP server unavailable: fetch is missing',
      },
      async listTools() {
        return [];
      },
      async callTool() {
        return { ok: false, content: null, error: 'fetch is unavailable' };
      },
    };
  }

  return {
    info: {
      id: input.id,
      name: input.name,
      version: '1.0.0',
      description: `HTTP MCP bridge: ${input.endpoint}`,
    },
    async listTools(): Promise<McpToolDefinition[]> {
      const response = await fetchImpl(new URL('/tools', input.endpoint).toString(), {
        headers: input.headers,
      });
      if (!response.ok) throw new Error(`HTTP MCP listTools failed: ${response.status}`);
      const payload = await response.json() as { tools?: McpToolDefinition[] };
      return payload.tools ?? [];
    },
    async callTool(call: McpToolCall): Promise<McpToolResult> {
      const response = await fetchImpl(new URL('/call', input.endpoint).toString(), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...input.headers,
        },
        body: JSON.stringify(call),
      });
      if (!response.ok) {
        return { ok: false, content: null, error: `HTTP MCP call failed: ${response.status}` };
      }
      return response.json() as Promise<McpToolResult>;
    },
  };
}

/** Minimal MCP Streamable HTTP client: initialize, tools/list, and tools/call. */
export function createStreamableHttpMcpServer(input: {
  id: string;
  name: string;
  endpoint: string;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
}): McpServer {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  let initialized = false;
  let requestId = 0;
  const request = async (method: string, params?: Record<string, unknown>): Promise<unknown> => {
    if (!fetchImpl) throw new Error('fetch is unavailable');
    const response = await fetchImpl(input.endpoint, {
      method: 'POST',
      headers: { accept: 'application/json, text/event-stream', 'content-type': 'application/json', ...input.headers },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, ...(params ? { params } : {}) }),
    });
    if (!response.ok) throw new Error(`MCP ${method} failed: ${response.status}`);
    const payload = await response.json() as { result?: unknown; error?: { message?: string } };
    if (payload.error) throw new Error(payload.error.message || `MCP ${method} failed`);
    return payload.result;
  };
  const ensureInitialized = async () => {
    if (initialized) return;
    await request('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'OmniAgent', version: '0.1.0' },
    });
    initialized = true;
  };
  return {
    info: { id: input.id, name: input.name, version: '1.0.0', description: `MCP Streamable HTTP: ${input.endpoint}` },
    async listTools() {
      await ensureInitialized();
      const result = await request('tools/list') as { tools?: Array<{ name: string; description?: string; inputSchema?: { properties?: Record<string, { type?: string; description?: string }>; required?: string[] } }> };
      return (result.tools ?? []).map((tool) => ({
        name: tool.name,
        description: tool.description ?? tool.name,
        parameters: Object.entries(tool.inputSchema?.properties ?? {}).map(([name, schema]) => ({
          name, type: normalizeParameterType(schema.type), description: schema.description ?? '', required: tool.inputSchema?.required?.includes(name),
        })),
      }));
    },
    async callTool(call) {
      await ensureInitialized();
      const result = await request('tools/call', { name: call.name, arguments: call.arguments ?? {} });
      return { ok: true, content: result };
    },
  };
}

function normalizeParameterType(value: string | undefined): McpToolDefinition['parameters'][number]['type'] {
  return value === 'number' || value === 'boolean' || value === 'object' || value === 'array' ? value : 'string';
}
