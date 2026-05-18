/**
 * @file useOpenDraft.test.ts
 * @description 创建并打开未保存草稿用例测试。
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock localforage
const mockStorage = new Map<string, unknown>();

const createLocalforageInstance = () => ({
  config: vi.fn(),
  getItem: vi.fn((key: string) => Promise.resolve(mockStorage.get(key) ?? null)),
  setItem: vi.fn((key: string, value: unknown) => {
    mockStorage.set(key, value);
    return Promise.resolve();
  }),
  removeItem: vi.fn((key: string) => {
    mockStorage.delete(key);
    return Promise.resolve();
  }),
  clear: vi.fn(() => {
    mockStorage.clear();
    return Promise.resolve();
  }),
  createInstance: vi.fn(() => createLocalforageInstance())
});

const localforageMock = createLocalforageInstance();

vi.mock('localforage', () => ({
  default: localforageMock
}));

async function importOpenDraftModule() {
  return import('@/hooks/useOpenDraft');
}

describe('extractNameAndExt', () => {
  beforeEach(() => {
    vi.resetModules();
    setActivePinia(createPinia());
    mockStorage.clear();
  });

  it('extracts name and default ext from path without extension', () => {
    return importOpenDraftModule().then(({ extractNameAndExt }) => {
      expect(extractNameAndExt('notes/idea')).toEqual({ name: 'idea', ext: 'md' });
    });
  });

  it('extracts name and ext from path with extension', () => {
    return importOpenDraftModule().then(({ extractNameAndExt }) => {
      expect(extractNameAndExt('drafts/plan.md')).toEqual({ name: 'plan', ext: 'md' });
    });
  });

  it('extracts name and non-md extension', () => {
    return importOpenDraftModule().then(({ extractNameAndExt }) => {
      expect(extractNameAndExt('data/config.json')).toEqual({ name: 'config', ext: 'json' });
    });
  });

  it('handles single filename without path', () => {
    return importOpenDraftModule().then(({ extractNameAndExt }) => {
      expect(extractNameAndExt('readme')).toEqual({ name: 'readme', ext: 'md' });
    });
  });

  it('handles dotfiles without valid extension', () => {
    return importOpenDraftModule().then(({ extractNameAndExt }) => {
      expect(extractNameAndExt('.gitignore')).toEqual({ name: '.gitignore', ext: 'md' });
    });
  });

  it('handles dotfiles with valid extension', () => {
    return importOpenDraftModule().then(({ extractNameAndExt }) => {
      expect(extractNameAndExt('.env.local')).toEqual({ name: '.env', ext: 'local' });
    });
  });

  it('handles backslash separators', () => {
    return importOpenDraftModule().then(({ extractNameAndExt }) => {
      expect(extractNameAndExt('notes\\idea')).toEqual({ name: 'idea', ext: 'md' });
    });
  });

  it('handles empty path', () => {
    return importOpenDraftModule().then(({ extractNameAndExt }) => {
      expect(extractNameAndExt('')).toEqual({ name: 'Untitled', ext: 'md' });
    });
  });

  it('handles path ending with separator', () => {
    return importOpenDraftModule().then(({ extractNameAndExt }) => {
      expect(extractNameAndExt('notes/')).toEqual({ name: 'notes', ext: 'md' });
    });
  });

  it('rejects invalid extension characters', () => {
    return importOpenDraftModule().then(({ extractNameAndExt }) => {
      expect(extractNameAndExt('file.txt!')).toEqual({ name: 'file.txt!', ext: 'md' });
    });
  });

  it('limits extension length to 20 characters', () => {
    return importOpenDraftModule().then(({ extractNameAndExt }) => {
      const longExt = 'a'.repeat(21);
      expect(extractNameAndExt(`file.${longExt}`)).toEqual({ name: `file.${longExt}`, ext: 'md' });
    });
  });
});
