import type { SkillDefinition, SkillInput, SkillManifest, SkillMatch } from './types.js';
import { SkillRegistry } from './registry.js';
import { parseSkillPackage } from './parser.js';
import { builtinSkills } from './builtins.js';

export interface SkillRepository {
  listSkills(): Promise<SkillDefinition[]>;
  saveSkill(skill: SkillDefinition): Promise<SkillDefinition>;
  deleteSkill(id: string): Promise<void>;
}

export class SkillService {
  private seeded = false;

  constructor(
    private readonly repository: SkillRepository,
    private readonly registry = new SkillRegistry(),
  ) {}

  async ensureReady(): Promise<void> {
    if (this.seeded) return;
    const stored = await this.repository.listSkills();
    if (!stored.length) {
      for (const skill of builtinSkills) {
        await this.repository.saveSkill(toDefinition(skill));
      }
    }
    this.registry.clear();
    for (const skill of await this.repository.listSkills()) {
      this.registry.register(skill);
    }
    this.seeded = true;
  }

  async list(options: { enabledOnly?: boolean } = {}): Promise<SkillDefinition[]> {
    await this.ensureReady();
    return this.registry.list(options);
  }

  async get(id: string): Promise<SkillDefinition | undefined> {
    await this.ensureReady();
    return this.registry.get(id);
  }

  async register(input: SkillInput): Promise<SkillDefinition> {
    await this.ensureReady();
    const skill = toDefinition(input);
    const saved = await this.repository.saveSkill(skill);
    this.registry.register(saved);
    return saved;
  }

  async installFromPackage(input: {
    manifest: string | SkillManifest;
    skillMd?: string;
    workflow?: string[];
    knowledge?: string[];
    enabled?: boolean;
    source?: 'builtin' | 'user';
  }): Promise<SkillDefinition> {
    const parsed = parseSkillPackage(input);
    return this.register({
      id: slugify(parsed.manifest.name),
      name: parsed.manifest.name,
      version: parsed.manifest.version,
      description: parsed.manifest.description,
      prompt: parsed.prompt,
      tools: parsed.manifest.tools,
      permissions: parsed.manifest.permissions,
      triggers: parsed.manifest.triggers,
      workflow: parsed.workflow,
      knowledge: parsed.knowledge,
      enabled: input.enabled ?? true,
      source: input.source ?? 'user',
    });
  }

  async setEnabled(id: string, enabled: boolean): Promise<SkillDefinition> {
    await this.ensureReady();
    const existing = this.registry.get(id);
    if (!existing) throw new Error(`Skill not found: ${id}`);
    const updated: SkillDefinition = { ...existing, enabled, updatedAt: Date.now() };
    const saved = await this.repository.saveSkill(updated);
    this.registry.register(saved);
    return saved;
  }

  async remove(id: string): Promise<void> {
    await this.ensureReady();
    await this.repository.deleteSkill(id);
    this.registry.unregister(id);
  }

  async match(query: string, options: { limit?: number } = {}): Promise<SkillMatch[]> {
    await this.ensureReady();
    return this.registry.match(query, { ...options, enabledOnly: true });
  }

  async invoke(id: string, query = ''): Promise<string> {
    await this.ensureReady();
    const skill = this.registry.get(id);
    if (!skill) throw new Error(`Skill not found: ${id}`);
    if (!skill.enabled) throw new Error(`Skill is disabled: ${id}`);
    return this.formatContext([{ skill, score: 1 }], query);
  }

  formatContext(matches: SkillMatch[], query = ''): string {
    if (!matches.length) return '';
    const blocks = matches.map(({ skill }) => {
      const lines = [
        `## ${skill.manifest.name}`,
        skill.manifest.description,
        '',
        skill.prompt,
      ];
      if (skill.workflow.length) {
        lines.push('', 'Workflow:', ...skill.workflow.map((step) => `- ${step}`));
      }
      if (skill.knowledge.length) {
        lines.push('', 'Knowledge:', ...skill.knowledge.map((item) => `- ${item}`));
      }
      if (skill.manifest.tools?.length) {
        lines.push('', `Tools: ${skill.manifest.tools.join(', ')}`);
      }
      return lines.filter((line) => line !== undefined).join('\n').trim();
    });
    const header = query
      ? `当前用户请求可能适合以下 Skill，请按相关 Skill 的指引作答：`
      : '请按以下 Skill 指引作答：';
    return ['<omniagent-skill>', header, '', ...blocks, '</omniagent-skill>'].join('\n');
  }
}

function toDefinition(input: SkillInput): SkillDefinition {
  const now = Date.now();
  const name = input.name.trim();
  if (!name) throw new Error('Skill name is required');
  const prompt = input.prompt.trim();
  if (!prompt) throw new Error('Skill prompt is required');
  return {
    id: input.id?.trim() || slugify(name),
    manifest: {
      name,
      version: input.version?.trim() || '1.0.0',
      description: input.description.trim(),
      tools: unique(input.tools ?? []),
      permissions: unique(input.permissions ?? []),
      triggers: unique(input.triggers ?? []),
    },
    prompt,
    workflow: unique(input.workflow ?? []),
    knowledge: unique(input.knowledge ?? []),
    enabled: input.enabled ?? true,
    source: input.source ?? 'user',
    createdAt: now,
    updatedAt: now,
  };
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
  if (slug) return slug;
  const webCrypto = globalThis.crypto as Crypto | undefined;
  return webCrypto?.randomUUID?.() ?? `skill-${Date.now().toString(36)}`;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
