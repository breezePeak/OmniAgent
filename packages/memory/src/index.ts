import type { SupportedProvider } from '@omni-agent/shared';
import {
  type MemoryRecord,
  type MemoryScope,
  type MemoryType,
  OmniAgentStorage,
  storage as omniAgentStorage,
} from '@omni-agent/storage';

export interface MemoryInput {
  type: MemoryType;
  scope?: MemoryScope;
  providerId?: SupportedProvider | null;
  projectId?: string | null;
  content: string;
  summary?: string;
  importance?: number;
  confidence?: number;
}

export interface MemoryMatch {
  memory: MemoryRecord;
  score: number;
}

export class MemoryService {
  constructor(private readonly repository: OmniAgentStorage = omniAgentStorage) {}

  async save(input: MemoryInput): Promise<MemoryRecord> {
    const content = input.content.trim();
    if (!content) throw new Error('Memory content cannot be empty');
    const scope = input.scope ?? 'global';
    const providerId = input.providerId ?? null;
    const projectId = input.projectId ?? null;
    const existing = (await this.repository.listMemories()).find((memory) =>
      memory.content === content &&
      memory.scope === scope &&
      memory.providerId === providerId &&
      memory.projectId === projectId,
    );
    if (existing) return existing;
    return this.repository.saveMemory({
      type: input.type,
      scope,
      providerId,
      projectId,
      content,
      summary: input.summary?.trim() || summarize(content),
      keywords: keywordsFor(content),
      importance: clamp(input.importance ?? 0.5),
      confidence: clamp(input.confidence ?? 0.8),
    });
  }

  async extractExplicitUserMemory(content: string): Promise<MemoryRecord | null> {
    const normalized = content.trim();
    if (!isExplicitMemory(normalized)) return null;
    return this.save({
      type: inferMemoryType(normalized),
      content: normalizeMemoryContent(normalized),
      importance: 0.8,
      confidence: 0.9,
    });
  }

  async delete(id: string): Promise<void> {
    await this.repository.deleteMemory(id);
  }

  async retrieve(query: string, options: { providerId?: SupportedProvider; projectId?: string; limit?: number } = {}): Promise<MemoryMatch[]> {
    const queryKeywords = new Set(keywordsFor(query));
    const matches = (await this.repository.listMemories())
      .filter((memory) => isInScope(memory, options))
      .map((memory) => ({ memory, score: scoreMemory(memory, queryKeywords) }))
      .filter((match) => match.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, options.limit ?? 8);
    await Promise.all(matches.map(({ memory }) => this.repository.markMemoryAccessed(memory.id)));
    return matches;
  }

  formatContext(matches: MemoryMatch[]): string {
    if (!matches.length) return '';
    return ['<omniagent-memory>', ...matches.map(({ memory }) => `- ${memory.summary}`), '</omniagent-memory>'].join('\n');
  }
}

export const memory = new MemoryService();

function isExplicitMemory(content: string): boolean {
  return (
    /^(请)?(帮我)?记住[：:\s]/u.test(content) ||
    /我(喜欢|偏好|习惯|通常|不喜欢)/u.test(content) ||
    /我(叫|是|的名字是)/u.test(content) ||
    /我住在|我在|我的职业|我的工作/u.test(content)
  );
}

function inferMemoryType(content: string): MemoryType {
  if (/我(喜欢|偏好|习惯|通常|不喜欢)/u.test(content)) return 'preference';
  if (/我(叫|是|的名字是)|我住在|我的职业|我的工作/u.test(content)) return 'profile';
  return 'knowledge';
}

function normalizeMemoryContent(content: string): string {
  return content
    .replace(/^(请)?(帮我)?记住[：:\s]*/u, '')
    .replace(/^(请)?(帮我)?记下[：:\s]*/u, '')
    .trim() || content;
}

function summarize(content: string): string {
  return content.length > 160 ? `${content.slice(0, 157)}...` : content;
}

function keywordsFor(content: string): string[] {
  const normalized = content.toLowerCase();
  const keywords = new Set(normalized.match(/[a-z0-9_]{2,}/gu) ?? []);
  for (const run of normalized.match(/[\p{Script=Han}]+/gu) ?? []) {
    const chars = [...run];
    chars.forEach((char) => keywords.add(char));
    for (let index = 0; index < chars.length - 1; index += 1) {
      keywords.add(`${chars[index]}${chars[index + 1]}`);
    }
  }
  return [...keywords];
}

function scoreMemory(memory: MemoryRecord, queryKeywords: Set<string>): number {
  const overlap = memory.keywords.filter((keyword) => queryKeywords.has(keyword)).length;
  if (!overlap) return 0;
  return overlap * 10 + memory.importance * 2 + memory.confidence;
}

function isInScope(memory: MemoryRecord, options: { providerId?: SupportedProvider; projectId?: string }): boolean {
  if (memory.scope === 'global') return true;
  if (memory.scope === 'provider') return memory.providerId === options.providerId;
  return memory.projectId === options.projectId;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}
