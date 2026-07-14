import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { OmniAgentDatabase, OmniAgentStorage } from '@omni-agent/storage';
import { SkillService } from '../src/index.js';
import type { SkillDefinition } from '../src/index.js';

if (typeof globalThis.CustomEvent === 'undefined') {
  globalThis.CustomEvent = class CustomEvent<T = unknown> extends Event {
    readonly detail: T;
    constructor(type: string, params?: CustomEventInit<T>) {
      super(type, params);
      this.detail = params?.detail as T;
    }
  } as typeof CustomEvent;
}

function createService() {
  const storage = new OmniAgentStorage(new OmniAgentDatabase(`omni-agent-skills-test-${randomUUID()}`));
  const repository = {
    listSkills: async () => {
      const records = await storage.listSkills();
      return records.map(toDefinition);
    },
    saveSkill: async (skill: SkillDefinition) => {
      const saved = await storage.saveSkill({
        id: skill.id,
        name: skill.manifest.name,
        version: skill.manifest.version,
        description: skill.manifest.description,
        prompt: skill.prompt,
        tools: skill.manifest.tools ?? [],
        permissions: skill.manifest.permissions ?? [],
        triggers: skill.manifest.triggers ?? [],
        workflow: skill.workflow,
        knowledge: skill.knowledge,
        enabled: skill.enabled,
        source: skill.source,
        createdAt: skill.createdAt,
        updatedAt: skill.updatedAt,
      });
      return toDefinition(saved);
    },
    deleteSkill: async (id: string) => storage.deleteSkill(id),
  };
  return { storage, service: new SkillService(repository) };
}

function toDefinition(record: Awaited<ReturnType<OmniAgentStorage['listSkills']>>[number]): SkillDefinition {
  return {
    id: record.id,
    manifest: {
      name: record.name,
      version: record.version,
      description: record.description,
      tools: record.tools,
      permissions: record.permissions,
      triggers: record.triggers,
    },
    prompt: record.prompt,
    workflow: record.workflow,
    knowledge: record.knowledge,
    enabled: record.enabled,
    source: record.source,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

test('keeps builtin skills as templates until a user installs one', async (t) => {
  const { storage, service } = createService();
  t.after(() => storage.db.delete());

  const skills = await service.list();
  assert.deepEqual(skills, []);
  assert.ok(service.listTemplates().some((skill) => skill.id === 'research-agent'));

  await service.installTemplate('research-agent');
  const matches = await service.match('请帮我调研 OmniAgent 的竞品');
  assert.ok(matches.length >= 1);
  assert.equal(matches[0]?.skill.id, 'research-agent');
  assert.match(service.formatContext(matches), /research-agent|研究型助手/);
});

test('registers user skill from package and can disable it', async (t) => {
  const { storage, service } = createService();
  t.after(() => storage.db.delete());

  const installed = await service.installFromPackage({
    manifest: {
      name: 'meeting-notes',
      version: '1.0.0',
      description: '整理会议纪要',
      triggers: ['会议', '纪要'],
    },
    skillMd: [
      '# Prompt',
      '把讨论整理成决议、待办和风险。',
      '',
      '# Workflow',
      '- 提取决议',
      '- 列出待办',
    ].join('\n'),
  });

  assert.equal(installed.manifest.name, 'meeting-notes');
  assert.deepEqual(installed.workflow, ['提取决议', '列出待办']);

  await service.setEnabled(installed.id, false);
  const matches = await service.match('帮我写会议纪要');
  assert.equal(matches.some((match) => match.skill.id === installed.id), false);
});

test('invokes a skill by id', async (t) => {
  const { storage, service } = createService();
  t.after(() => storage.db.delete());

  await service.installTemplate('concise-reply');
  const context = await service.invoke('concise-reply', '请简洁回答');
  assert.match(context, /omniagent-skill/);
  assert.match(context, /简洁/);
});
