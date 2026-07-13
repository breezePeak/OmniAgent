export interface SkillManifest {
  name: string;
  version: string;
  description: string;
  tools?: string[];
  permissions?: string[];
  triggers?: string[];
  memoryRules?: {
    save?: boolean;
    types?: Array<'profile' | 'preference' | 'project' | 'episode' | 'procedure' | 'knowledge'>;
  };
}

export interface SkillDefinition {
  id: string;
  manifest: SkillManifest;
  prompt: string;
  workflow: string[];
  knowledge: string[];
  enabled: boolean;
  source: 'builtin' | 'user';
  createdAt: number;
  updatedAt: number;
}

export interface SkillMatch {
  skill: SkillDefinition;
  score: number;
}

export interface SkillInput {
  id?: string;
  name: string;
  version?: string;
  description: string;
  prompt: string;
  tools?: string[];
  permissions?: string[];
  triggers?: string[];
  workflow?: string[];
  knowledge?: string[];
  enabled?: boolean;
  source?: 'builtin' | 'user';
}

export interface ParsedSkillPackage {
  manifest: SkillManifest;
  prompt: string;
  workflow: string[];
  knowledge: string[];
}
