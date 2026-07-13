import type { ParsedSkillPackage, SkillManifest } from './types.js';

/**
 * Parse a lightweight skill package.
 * Accepts either a full package object or a SKILL.md + manifest.json pair.
 */
export function parseSkillPackage(input: {
  manifest: string | SkillManifest;
  skillMd?: string;
  workflow?: string[];
  knowledge?: string[];
}): ParsedSkillPackage {
  const manifest = typeof input.manifest === 'string'
    ? parseManifestJson(input.manifest)
    : normalizeManifest(input.manifest);

  const fromMarkdown = input.skillMd ? parseSkillMarkdown(input.skillMd) : null;
  const prompt = fromMarkdown?.prompt?.trim() || manifest.description;
  if (!prompt) throw new Error('Skill prompt cannot be empty');

  return {
    manifest,
    prompt,
    workflow: input.workflow ?? fromMarkdown?.workflow ?? [],
    knowledge: input.knowledge ?? fromMarkdown?.knowledge ?? [],
  };
}

export function parseManifestJson(raw: string): SkillManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Skill manifest.json is not valid JSON');
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('Skill manifest must be an object');
  return normalizeManifest(parsed as SkillManifest);
}

export function parseSkillMarkdown(markdown: string): { prompt: string; workflow: string[]; knowledge: string[] } {
  const sections = splitMarkdownSections(markdown);
  const prompt = sections.get('prompt')
    ?? sections.get('system')
    ?? sections.get('')
    ?? markdown.trim();
  return {
    prompt: prompt.trim(),
    workflow: listItems(sections.get('workflow') ?? sections.get('流程') ?? ''),
    knowledge: listItems(sections.get('knowledge') ?? sections.get('知识') ?? ''),
  };
}

function normalizeManifest(input: SkillManifest): SkillManifest {
  if (!input.name?.trim()) throw new Error('Skill manifest.name is required');
  return {
    name: input.name.trim(),
    version: input.version?.trim() || '1.0.0',
    description: input.description?.trim() || '',
    tools: uniqueStrings(input.tools ?? []),
    permissions: uniqueStrings(input.permissions ?? []),
    triggers: uniqueStrings(input.triggers ?? []),
    memoryRules: input.memoryRules,
  };
}

function splitMarkdownSections(markdown: string): Map<string, string> {
  const sections = new Map<string, string>();
  let current = '';
  const buffer: string[] = [];
  for (const line of markdown.split(/\r?\n/u)) {
    const heading = line.match(/^#{1,3}\s+(.+)$/u);
    if (heading) {
      sections.set(current, buffer.join('\n').trim());
      current = heading[1].trim().toLowerCase();
      buffer.length = 0;
      continue;
    }
    buffer.push(line);
  }
  sections.set(current, buffer.join('\n').trim());
  return sections;
}

function listItems(text: string): string[] {
  return text
    .split(/\r?\n/u)
    .map((line) => line.replace(/^[-*+]\s+/u, '').trim())
    .filter(Boolean);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
