import type { ToolDefinition, ToolDescriptor } from './types.js';

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    if (!tool.name.trim()) throw new Error('Tool name is required');
    this.tools.set(tool.name, tool);
  }

  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): ToolDescriptor[] {
    return [...this.tools.values()]
      .map((tool) => toDescriptor(tool))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  clear(): void {
    this.tools.clear();
  }
}

function toDescriptor(tool: ToolDefinition): ToolDescriptor {
  return {
    name: tool.name,
    description: tool.description,
    source: tool.source,
    parameters: tool.parameters,
    permissions: tool.permissions,
  };
}
