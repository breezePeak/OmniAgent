export interface McpToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required?: boolean;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  parameters: McpToolParameter[];
}

export interface McpToolCall {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface McpToolResult {
  ok: boolean;
  content: unknown;
  error?: string;
}

export interface McpServerInfo {
  id: string;
  name: string;
  version: string;
  description?: string;
}

export interface McpServer {
  info: McpServerInfo;
  listTools(): Promise<McpToolDefinition[]>;
  callTool(call: McpToolCall): Promise<McpToolResult>;
}

export interface McpServerConfig {
  id: string;
  name: string;
  enabled?: boolean;
  /** Built-in server kind for the first MVP. */
  kind: 'memory-notes' | 'echo' | 'http';
  endpoint?: string;
  headers?: Record<string, string>;
}

export interface RegisteredMcpServer {
  config: McpServerConfig;
  server: McpServer;
  tools: McpToolDefinition[];
  connectedAt: number;
}
