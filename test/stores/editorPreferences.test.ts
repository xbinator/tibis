/**
 * @file editorPreferences.test.ts
 * @description 验证编辑器偏好 store 的持久化与旧设置迁移。
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const EDITOR_PREFERENCES_STORAGE_KEY = 'editor_preferences';
const SETTINGS_STORAGE_KEY = 'app_settings';
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

vi.stubGlobal('matchMedia', () => ({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn()
}));

vi.mock('@/shared/platform', () => ({
  native: {
    updateMenuItem: vi.fn()
  }
}));

describe('useEditorPreferencesStore', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('persists editor preferences into dedicated storage', async () => {
    const { useEditorPreferencesStore } = await import('@/stores/editor/preferences');
    const store = useEditorPreferencesStore();

    store.setViewMode('source');
    store.setPageWidth('full');
    store.setSaveStrategy('onChange');

    expect(localStorage.getItem(EDITOR_PREFERENCES_STORAGE_KEY)).toContain('"viewMode":"source"');
    expect(localStorage.getItem(EDITOR_PREFERENCES_STORAGE_KEY)).toContain('"pageWidth":"full"');
    expect(localStorage.getItem(EDITOR_PREFERENCES_STORAGE_KEY)).toContain('"saveStrategy":"onChange"');
  });

  it('migrates legacy editor settings from app_settings when dedicated storage is missing', async () => {
    const { local } = await import('@/shared/storage/base');

    local.setItem(SETTINGS_STORAGE_KEY, {
      chatSidebarActiveSessionId: null,
      providerSidebarCollapsed: false,
      settingsSidebarCollapsed: false,
      theme: 'system',
      sourceMode: true,
      editorPageWidth: 'wide',
      sidebarVisible: false,
      sidebarWidth: 340,
      toolPermissionMode: 'ask',
      alwaysToolPermissionGrants: {}
    });

    const { useEditorPreferencesStore } = await import('@/stores/editor/preferences');
    const store = useEditorPreferencesStore();

    expect(store.viewMode).toBe('source');
    expect(store.pageWidth).toBe('wide');
    expect(store.saveStrategy).toBe('off');
    expect(localStorage.getItem(EDITOR_PREFERENCES_STORAGE_KEY)).toContain('"pageWidth":"wide"');
  });

  it('falls back to defaults when persisted values are invalid', async () => {
    const { local } = await import('@/shared/storage/base');

    local.setItem(EDITOR_PREFERENCES_STORAGE_KEY, {
      viewMode: 'preview',
      pageWidth: 'giant',
      saveStrategy: 'always'
    });

    const { useEditorPreferencesStore } = await import('@/stores/editor/preferences');
    const store = useEditorPreferencesStore();

    expect(store.viewMode).toBe('rich');
    expect(store.pageWidth).toBe('default');
    expect(store.saveStrategy).toBe('off');
  });
});
