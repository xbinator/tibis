/**
 * @file skill.test.ts
 * @description Skill Pinia Store 测试。
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SkillDefinition } from '@/ai/skill/types';
import { useSkillStore } from '@/stores/ai/skill';

/** Mock localStorage for storage module */
vi.mock('@/shared/storage/base', () => ({
  local: {
    getItem: vi.fn(() => null),
    setItem: vi.fn()
  }
}));

const sampleSkill: SkillDefinition = {
  name: 'react-patterns',
  description: 'Use when building React components.',
  content: '# React Patterns\n\n1. Prefer composition',
  filePath: '/workspace/.agents/skills/react-patterns/SKILL.md',
  dirPath: '/workspace/.agents/skills/react-patterns',
  source: 'project',
  enabled: true,
  parsedAt: Date.now()
};

const sampleSkill2: SkillDefinition = {
  name: 'api-design',
  description: 'Use when designing APIs.',
  content: '# API Design\n\nREST conventions',
  filePath: '/workspace/.agents/skills/api-design/SKILL.md',
  dirPath: '/workspace/.agents/skills/api-design',
  source: 'project',
  enabled: true,
  parsedAt: Date.now()
};

describe('useSkillStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('initializes with empty skills', () => {
    const store = useSkillStore();
    expect(store.skills).toEqual([]);
    expect(store.initialized).toBe(false);
  });

  it('getSkillByName returns matching skill', () => {
    const store = useSkillStore();
    store.$patch({ skills: [sampleSkill, sampleSkill2] });

    expect(store.getSkillByName('react-patterns')).toEqual(sampleSkill);
    expect(store.getSkillByName('nonexistent')).toBeUndefined();
  });

  it('getEnabledSkills returns only enabled skills without parse errors', () => {
    const store = useSkillStore();
    const disabledSkill: SkillDefinition = { ...sampleSkill2, enabled: false };
    const errorSkill: SkillDefinition = { ...sampleSkill, name: 'bad', parseError: 'Missing name' };
    store.$patch({ skills: [sampleSkill, disabledSkill, errorSkill] });

    const enabled = store.getEnabledSkills();
    expect(enabled).toHaveLength(1);
    expect(enabled[0].name).toBe('react-patterns');
  });

  it('toggleSkill toggles enabled state', () => {
    const store = useSkillStore();
    store.$patch({ skills: [sampleSkill] });

    store.toggleSkill('react-patterns');
    expect(store.skills[0].enabled).toBe(false);

    store.toggleSkill('react-patterns');
    expect(store.skills[0].enabled).toBe(true);
  });

  it('handleSkillChange updates skill on change event', () => {
    const store = useSkillStore();
    store.$patch({ skills: [sampleSkill] });

    const updatedSkill: SkillDefinition = {
      ...sampleSkill,
      description: 'Updated description.',
      content: '# Updated content'
    };
    store.handleSkillChange('change', updatedSkill);

    expect(store.skills[0].description).toBe('Updated description.');
  });

  it('handleSkillChange adds new skill on add event', () => {
    const store = useSkillStore();
    store.$patch({ skills: [sampleSkill] });

    store.handleSkillChange('add', sampleSkill2);

    expect(store.skills).toHaveLength(2);
    expect(store.skills[1].name).toBe('api-design');
  });

  it('handleSkillChange removes skill on unlink event', () => {
    const store = useSkillStore();
    store.$patch({ skills: [sampleSkill, sampleSkill2] });

    store.handleSkillChange('unlink', { filePath: sampleSkill.filePath } as SkillDefinition);

    expect(store.skills).toHaveLength(1);
    expect(store.skills[0].name).toBe('api-design');
  });

  it('parseErrors tracks skills with parse errors', () => {
    const store = useSkillStore();
    const errorSkill: SkillDefinition = {
      name: '',
      description: '',
      content: '',
      filePath: '/bad/SKILL.md',
      dirPath: '/bad',
      source: 'project',
      enabled: true,
      parsedAt: Date.now(),
      parseError: 'Missing frontmatter'
    };
    store.$patch({ skills: [sampleSkill, errorSkill] });

    expect(store.parseErrors.size).toBe(1);
    expect(store.parseErrors.get('/bad/SKILL.md')).toBe('Missing frontmatter');
  });
});
