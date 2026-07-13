import { SkillService, type SkillRepository } from './service.js';

export type {
  ParsedSkillPackage,
  SkillDefinition,
  SkillInput,
  SkillManifest,
  SkillMatch,
} from './types.js';
export { SkillRegistry } from './registry.js';
export { SkillService, type SkillRepository } from './service.js';
export { parseManifestJson, parseSkillMarkdown, parseSkillPackage } from './parser.js';
export { builtinSkills } from './builtins.js';

/** Default service without persistence; callers should inject a repository for extension use. */
export function createSkillService(repository: SkillRepository): SkillService {
  return new SkillService(repository);
}
