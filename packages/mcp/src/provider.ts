import type { McpServer, McpServerConfig, McpToolDefinition, RegisteredMcpServer } from './types.js';
import { createEchoServer, createHttpMcpServer, createMemoryNotesServer, createStreamableHttpMcpServer } from './servers.js';

export type ToolLike = {
  name: string;
  description: string;
  source: 'mcp';
  parameters: Array<{ name: string; type: 'string' | 'number' | 'boolean' | 'object' | 'array'; description: string; required?: boolean }>;
  permissions: string[];
  execute: (input: Record<string, unknown>) => Promise<unknown>;
};

export class McpProvider {
  private readonly servers = new Map<string, RegisteredMcpServer>();

  async connect(config: McpServerConfig, server?: McpServer): Promise<RegisteredMcpServer> {
    const resolved = server ?? createServerFromConfig(config);
    const tools = await resolved.listTools();
    const registered: RegisteredMcpServer = {
      config: { ...config, enabled: config.enabled !== false },
      server: resolved,
      tools,
      connectedAt: Date.now(),
    };
    this.servers.set(config.id, registered);
    return registered;
  }

  disconnect(id: string): boolean {
    return this.servers.delete(id);
  }

  listServers(): RegisteredMcpServer[] {
    return [...this.servers.values()].sort((a, b) => a.config.name.localeCompare(b.config.name));
  }

  getServer(id: string): RegisteredMcpServer | undefined {
    return this.servers.get(id);
  }

  listTools(): Array<McpToolDefinition & { serverId: string; qualifiedName: string }> {
    return this.listServers()
      .filter((server) => server.config.enabled !== false)
      .flatMap((server) =>
        server.tools.map((tool) => ({
          ...tool,
          serverId: server.config.id,
          qualifiedName: qualifyToolName(server.config.id, tool.name),
        })),
      );
  }

  async callTool(qualifiedName: string, args: Record<string, unknown> = {}): Promise<unknown> {
    const { serverId, toolName } = parseQualifiedName(qualifiedName);
    const registered = this.servers.get(serverId);
    if (!registered) throw new Error(`MCP server not found: ${serverId}`);
    if (registered.config.enabled === false) throw new Error(`MCP server disabled: ${serverId}`);
    const result = await registered.server.callTool({ name: toolName, arguments: args });
    if (!result.ok) throw new Error(result.error || `MCP tool failed: ${qualifiedName}`);
    return result.content;
  }

  toToolDefinitions(): ToolLike[] {
    return this.listTools().map((tool) => ({
      name: tool.qualifiedName,
      description: `[MCP:${tool.serverId}] ${tool.description}`,
      source: 'mcp' as const,
      parameters: tool.parameters,
      permissions: ['mcp.call'],
      execute: async (input: Record<string, unknown>) => this.callTool(tool.qualifiedName, input),
    }));
  }
}

export function qualifyToolName(serverId: string, toolName: string): string {
  return `mcp.${serverId}.${toolName}`;
}

export function parseQualifiedName(qualifiedName: string): { serverId: string; toolName: string } {
  const parts = qualifiedName.split('.');
  if (parts[0] !== 'mcp' || parts.length < 3) {
    throw new Error(`Invalid MCP tool name: ${qualifiedName}`);
  }
  return {
    serverId: parts[1],
    toolName: parts.slice(2).join('.'),
  };
}

function createServerFromConfig(config: McpServerConfig): McpServer {
  if (config.kind === 'echo') return createEchoServer();
  if (config.kind === 'memory-notes') return createMemoryNotesServer();
  if (config.kind === 'http') {
    if (!config.endpoint) throw new Error('HTTP MCP endpoint is required');
    return createHttpMcpServer({
      id: config.id,
      name: config.name,
      endpoint: config.endpoint,
      headers: config.headers,
    });
  }
  if (config.kind === 'streamable-http') {
    if (!config.endpoint) throw new Error('Streamable HTTP MCP endpoint is required');
    return createStreamableHttpMcpServer({ id: config.id, name: config.name, endpoint: config.endpoint, headers: config.headers });
  }
  throw new Error(`Unsupported MCP server kind: ${(config as McpServerConfig).kind}`);
}
