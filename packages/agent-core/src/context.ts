import type { AgentContext } from './types.js';

export interface ContextSources {
  retrieveMemory?(goal: string, options?: { providerId?: string | null; projectId?: string | null }): Promise<string>;
  matchSkills?(goal: string): Promise<string>;
  describeTools?(options?: { names?: string[]; limit?: number }): string | Promise<string>;
}

export class ContextBuilder {
  constructor(private readonly sources: ContextSources) {}

  async build(goal: string, options: { providerId?: string | null; projectId?: string | null } = {}): Promise<AgentContext> {
    const [memoryContext, skillContext, toolContext] = await Promise.all([
      this.sources.retrieveMemory?.(goal, options) ?? Promise.resolve(''),
      this.sources.matchSkills?.(goal) ?? Promise.resolve(''),
      Promise.resolve(this.sources.describeTools?.() ?? ''),
    ]);
    return {
      goal,
      memoryContext,
      skillContext,
      toolContext: typeof toolContext === 'string' ? toolContext : await toolContext,
      providerId: options.providerId ?? null,
      projectId: options.projectId ?? null,
    };
  }

  formatPrompt(context: AgentContext): string {
    return [
      context.memoryContext,
      context.skillContext,
      context.toolContext,
      `用户目标：${context.goal}`,
    ].filter(Boolean).join('\n\n');
  }
}
