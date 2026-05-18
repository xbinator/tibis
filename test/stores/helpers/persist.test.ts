/**
 * @file persist.test.ts
 * @description 验证持久化中间层 loadPersistedState / persistState 的加载、归一化、迁移行为。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersistConfig } from '@/stores/helpers/types';

const storage = new Map<string, string>();

vi.stubGlobal('localStorage', {
  getItem(key: string): string | null {
    return storage.get(key) ?? null;
  },
  setItem(key: string, value: string): void {
    storage.set(key, value);
  },
  removeItem(key: string): void {
    storage.delete(key);
  },
  clear(): void {
    storage.clear();
  }
});

interface TestState {
  theme: string;
  count: number;
}

const DEFAULT_STATE: TestState = { theme: 'system', count: 0 };

function normalizeTestState(value: unknown): TestState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_STATE };
  }
  const partial = value as Partial<TestState>;
  return {
    theme: typeof partial.theme === 'string' ? partial.theme : DEFAULT_STATE.theme,
    count: typeof partial.count === 'number' ? partial.count : DEFAULT_STATE.count
  };
}

describe('loadPersistedState', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it('returns defaults when no persisted data exists', async () => {
    const { loadPersistedState } = await import('@/stores/helpers/persist');
    const config: PersistConfig<TestState> = {
      storageKey: 'test_key',
      defaults: DEFAULT_STATE,
      normalize: normalizeTestState
    };

    const result = loadPersistedState(config);

    expect(result).toEqual(DEFAULT_STATE);
  });

  it('loads and normalizes persisted data from main key', async () => {
    const { local } = await import('@/shared/storage/base');
    local.setItem('test_key', { theme: 'dark', count: 5 });

    const { loadPersistedState } = await import('@/stores/helpers/persist');
    const config: PersistConfig<TestState> = {
      storageKey: 'test_key',
      defaults: DEFAULT_STATE,
      normalize: normalizeTestState
    };

    const result = loadPersistedState(config);

    expect(result).toEqual({ theme: 'dark', count: 5 });
  });

  it('normalizes invalid persisted data', async () => {
    const { local } = await import('@/shared/storage/base');
    local.setItem('test_key', { theme: 123, count: 'bad' });

    const { loadPersistedState } = await import('@/stores/helpers/persist');
    const config: PersistConfig<TestState> = {
      storageKey: 'test_key',
      defaults: DEFAULT_STATE,
      normalize: normalizeTestState
    };

    const result = loadPersistedState(config);

    expect(result).toEqual({ theme: 'system', count: 0 });
  });

  it('migrates from legacy key when main key does not exist', async () => {
    const { local } = await import('@/shared/storage/base');
    local.setItem('legacy_key', { oldTheme: 'light' });

    const { loadPersistedState } = await import('@/stores/helpers/persist');
    const config: PersistConfig<TestState> = {
      storageKey: 'test_key',
      defaults: DEFAULT_STATE,
      normalize: normalizeTestState,
      migrations: [
        {
          legacyKey: 'legacy_key',
          migrate: (legacyValue: unknown): Record<string, unknown> => {
            const legacy = legacyValue as { oldTheme: string };
            return { theme: legacy.oldTheme, count: 0 };
          }
        }
      ]
    };

    const result = loadPersistedState(config);

    expect(result).toEqual({ theme: 'light', count: 0 });
    expect(local.getItem('test_key')).toBeTruthy();
    expect(local.getItem('legacy_key')).toBeNull();
  });

  it('skips migration when main key exists', async () => {
    const { local } = await import('@/shared/storage/base');
    local.setItem('test_key', { theme: 'dark', count: 3 });
    local.setItem('legacy_key', { oldTheme: 'light' });

    const { loadPersistedState } = await import('@/stores/helpers/persist');
    const config: PersistConfig<TestState> = {
      storageKey: 'test_key',
      defaults: DEFAULT_STATE,
      normalize: normalizeTestState,
      migrations: [
        {
          legacyKey: 'legacy_key',
          migrate: (legacyValue: unknown): Record<string, unknown> => {
            const legacy = legacyValue as { oldTheme: string };
            return { theme: legacy.oldTheme, count: 0 };
          }
        }
      ]
    };

    const result = loadPersistedState(config);

    expect(result).toEqual({ theme: 'dark', count: 3 });
    expect(local.getItem('legacy_key')).toBeTruthy();
  });

  it('tries multiple migrations in order, first success wins', async () => {
    const { local } = await import('@/shared/storage/base');
    local.setItem('second_legacy', { oldTheme: 'from-second' });

    const { loadPersistedState } = await import('@/stores/helpers/persist');
    const config: PersistConfig<TestState> = {
      storageKey: 'test_key',
      defaults: DEFAULT_STATE,
      normalize: normalizeTestState,
      migrations: [
        {
          legacyKey: 'first_legacy',
          migrate: (legacyValue: unknown): Record<string, unknown> => {
            const legacy = legacyValue as { oldTheme: string };
            return { theme: legacy.oldTheme, count: 0 };
          }
        },
        {
          legacyKey: 'second_legacy',
          migrate: (legacyValue: unknown): Record<string, unknown> => {
            const legacy = legacyValue as { oldTheme: string };
            return { theme: legacy.oldTheme, count: 0 };
          }
        }
      ]
    };

    const result = loadPersistedState(config);

    expect(result).toEqual({ theme: 'from-second', count: 0 });
    expect(local.getItem('second_legacy')).toBeNull();
  });
});

describe('persistState', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it('persists state to localStorage', async () => {
    const { local } = await import('@/shared/storage/base');
    const { persistState } = await import('@/stores/helpers/persist');

    persistState('test_key', { theme: 'dark', count: 7 });

    const stored = local.getItem<TestState>('test_key');
    expect(stored).toEqual({ theme: 'dark', count: 7 });
  });

  it('overwrites existing persisted state', async () => {
    const { local } = await import('@/shared/storage/base');
    const { persistState } = await import('@/stores/helpers/persist');

    persistState('test_key', { theme: 'dark', count: 1 });
    persistState('test_key', { theme: 'light', count: 2 });

    const stored = local.getItem<TestState>('test_key');
    expect(stored).toEqual({ theme: 'light', count: 2 });
  });
});
