import type { ToolCall, ToolContext, ToolResult, ToolServices } from './types.js';
import type { ToolRegistry } from './registry.js';
import type { PermissionManager } from './permissions.js';

export class ToolExecutor {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly permissions: PermissionManager,
    private readonly services: ToolServices = {},
  ) {}

  async execute(
    call: ToolCall,
    options: { providerId?: string | null; projectId?: string | null; services?: ToolServices } = {},
  ): Promise<ToolResult> {
    const started = Date.now();
    const name = call.name?.trim();
    if (!name) {
      return { ok: false, name: '', error: 'Tool name is required', durationMs: Date.now() - started };
    }

    const tool = this.registry.get(name);
    if (!tool) {
      return { ok: false, name, error: `Unknown tool: ${name}`, durationMs: Date.now() - started };
    }

    try {
      this.permissions.ensure(tool.permissions);
      validateInput(call.arguments ?? {}, tool.parameters.map((parameter) => parameter));
      const context: ToolContext = {
        providerId: options.providerId ?? null,
        projectId: options.projectId ?? null,
        grantedPermissions: this.permissions.snapshot(),
        services: { ...this.services, ...options.services },
      };
      const result = await tool.execute(call.arguments ?? {}, context);
      return { ok: true, name, result, durationMs: Date.now() - started };
    } catch (error) {
      return {
        ok: false,
        name,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - started,
      };
    }
  }

  async executeMany(
    calls: ToolCall[],
    options: { providerId?: string | null; projectId?: string | null; services?: ToolServices } = {},
  ): Promise<ToolResult[]> {
    const results: ToolResult[] = [];
    for (const call of calls) {
      results.push(await this.execute(call, options));
    }
    return results;
  }
}

function validateInput(
  input: Record<string, unknown>,
  parameters: Array<{ name: string; type: string; required?: boolean }>,
): void {
  for (const parameter of parameters) {
    const value = input[parameter.name];
    if (value === undefined || value === null || value === '') {
      if (parameter.required) throw new Error(`Missing required parameter: ${parameter.name}`);
      continue;
    }
    if (!matchesType(value, parameter.type)) {
      throw new Error(`Invalid type for ${parameter.name}: expected ${parameter.type}`);
    }
  }
}

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'array':
      return Array.isArray(value);
    default:
      return true;
  }
}
