import { ToolRegistry } from './registry.js';
import { ToolExecutor } from './executor.js';
import { DEFAULT_TOOL_PERMISSIONS, PermissionManager } from './permissions.js';
import { builtinTools } from './builtins.js';
import type { ToolCall, ToolDescriptor, ToolResult, ToolServices } from './types.js';

export interface ToolRuntimeOptions {
  services?: ToolServices;
  permissions?: readonly string[];
  includeBuiltins?: boolean;
}

export class ToolRuntime {
  readonly registry = new ToolRegistry();
  readonly permissions: PermissionManager;
  readonly executor: ToolExecutor;

  constructor(options: ToolRuntimeOptions = {}) {
    this.permissions = new PermissionManager(options.permissions ?? DEFAULT_TOOL_PERMISSIONS);
    this.executor = new ToolExecutor(this.registry, this.permissions, options.services ?? {});
    if (options.includeBuiltins !== false) {
      for (const tool of builtinTools) this.registry.register(tool);
    }
  }

  list(): ToolDescriptor[] {
    return this.registry.list();
  }

  describeForPrompt(options: { names?: string[]; limit?: number } = {}): string {
    const tools = this.list()
      .filter((tool) => !options.names || options.names.includes(tool.name))
      .slice(0, options.limit ?? 50);
    if (!tools.length) return '';
    const lines = tools.map((tool) => {
      const params = tool.parameters
        .map((parameter) => `${parameter.name}${parameter.required ? '' : '?'}: ${parameter.type}`)
        .join(', ');
      return `- ${tool.name}(${params}) — ${tool.description}`;
    });
    return ['<omniagent-tools>', '可用工具：', ...lines, '</omniagent-tools>'].join('\n');
  }

  execute(call: ToolCall, options: { providerId?: string | null; projectId?: string | null; services?: ToolServices } = {}): Promise<ToolResult> {
    return this.executor.execute(call, options);
  }

  executeMany(calls: ToolCall[], options: { providerId?: string | null; projectId?: string | null; services?: ToolServices } = {}): Promise<ToolResult[]> {
    return this.executor.executeMany(calls, options);
  }
}

export function createToolRuntime(options: ToolRuntimeOptions = {}): ToolRuntime {
  return new ToolRuntime(options);
}
