import type { SkillDefinition, SkillMatch } from './types.js';

export class SkillRegistry {
  private readonly skills = new Map<string, SkillDefinition>();

  register(skill: SkillDefinition): void {
    this.skills.set(skill.id, skill);
  }

  unregister(id: string): boolean {
    return this.skills.delete(id);
  }

  get(id: string): SkillDefinition | undefined {
    return this.skills.get(id);
  }

  list(options: { enabledOnly?: boolean } = {}): SkillDefinition[] {
    const skills = [...this.skills.values()].sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
    return options.enabledOnly ? skills.filter((skill) => skill.enabled) : skills;
  }

  match(query: string, options: { limit?: number; enabledOnly?: boolean } = {}): SkillMatch[] {
    const keywords = keywordsFor(query);
    return this.list({ enabledOnly: options.enabledOnly ?? true })
      .map((skill) => ({ skill, score: scoreSkill(skill, keywords, query) }))
      .filter((match) => match.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, options.limit ?? 3);
  }

  clear(): void {
    this.skills.clear();
  }
}

function scoreSkill(skill: SkillDefinition, queryKeywords: Set<string>, query: string): number {
  const haystack = [
    skill.manifest.name,
    skill.manifest.description,
    skill.prompt,
    ...(skill.manifest.triggers ?? []),
    ...skill.workflow,
    ...skill.knowledge,
  ].join('\n').toLowerCase();

  let score = 0;
  for (const trigger of skill.manifest.triggers ?? []) {
    const normalized = trigger.toLowerCase();
    if (query.toLowerCase().includes(normalized) || haystack.includes(normalized) && queryKeywords.has(normalized)) {
      score += 20;
    }
    if (queryKeywords.has(normalized)) score += 10;
  }

  const skillKeywords = keywordsFor(haystack);
  for (const keyword of queryKeywords) {
    if (skillKeywords.has(keyword)) score += keyword.length > 1 ? 2 : 1;
  }
  return score;
}

function keywordsFor(content: string): Set<string> {
  const normalized = content.toLowerCase();
  const keywords = new Set(normalized.match(/[a-z0-9_]{2,}/gu) ?? []);
  for (const run of normalized.match(/[\p{Script=Han}]+/gu) ?? []) {
    const chars = [...run];
    chars.forEach((char) => keywords.add(char));
    for (let index = 0; index < chars.length - 1; index += 1) {
      keywords.add(`${chars[index]}${chars[index + 1]}`);
    }
  }
  return keywords;
}
