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
