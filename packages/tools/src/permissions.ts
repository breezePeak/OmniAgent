export class PermissionManager {
  private readonly granted = new Set<string>();

  constructor(initial: readonly string[] = []) {
    for (const permission of initial) this.grant(permission);
  }

  grant(permission: string): void {
    const normalized = permission.trim();
    if (normalized) this.granted.add(normalized);
  }

  revoke(permission: string): void {
    this.granted.delete(permission.trim());
  }

  has(permission: string): boolean {
    return this.granted.has(permission) || this.granted.has('*');
  }

  ensure(permissions: readonly string[]): void {
    const missing = permissions.filter((permission) => !this.has(permission));
    if (missing.length) {
      throw new Error(`Missing permissions: ${missing.join(', ')}`);
    }
  }

  list(): string[] {
    return [...this.granted].sort();
  }

  snapshot(): ReadonlySet<string> {
    return new Set(this.granted);
  }
}

export const DEFAULT_TOOL_PERMISSIONS = [
  'memory.read',
  'memory.write',
  'browser.read',
  'browser.act',
  'browser.navigate',
  'mcp.call',
] as const;
