/**
 * @file setting.test.ts
 * @description 验证设置 store 的聊天侧边栏会话持久化行为。
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('useSettingStore', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('persists the active chat sidebar session id into app settings', async () => {
    const { useSettingStore } = await import('@/stores/setting');
    const settingStore = useSettingStore();

    settingStore.setChatSidebarActiveSessionId('session-42');

    expect(settingStore.chatSidebarActiveSessionId).toBe('session-42');
    expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toContain('"chatSidebarActiveSessionId":"session-42"');
  });

  it('restores the active chat sidebar session id from persisted app settings', async () => {
    const { local } = await import('@/shared/storage/base');

    local.setItem(SETTINGS_STORAGE_KEY, {
      chatSidebarActiveSessionId: 'session-restore',
      providerSidebarCollapsed: false,
      settingsSidebarCollapsed: false,
      theme: 'system',
      showOutline: true,
      sourceMode: false,
      editorPageWidth: 'default',
      sidebarVisible: false,
      sidebarWidth: 340,
      toolPermissionMode: 'ask',
      alwaysToolPermissionGrants: {}
    });

    const { useSettingStore } = await import('@/stores/setting');
    const settingStore = useSettingStore();

    expect(settingStore.chatSidebarActiveSessionId).toBe('session-restore');
  });

  it('stores always grants separately from session grants and clears session when always is granted', async () => {
    const { useSettingStore } = await import('@/stores/setting');
    const settingStore = useSettingStore();

    settingStore.grantToolPermission('update_settings', 'session');
    expect(settingStore.sessionToolPermissionGrants.update_settings).toBe(true);

    settingStore.grantToolPermission('update_settings', 'always');

    expect(settingStore.alwaysToolPermissionGrants.update_settings).toBe(true);
    expect(settingStore.sessionToolPermissionGrants.update_settings).toBeUndefined();
    expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toContain('"alwaysToolPermissionGrants":{"update_settings":true}');
  });

  it('does not restore session grants from persisted app settings', async () => {
    const { useSettingStore } = await import('@/stores/setting');
    const settingStore = useSettingStore();

    settingStore.grantToolPermission('update_settings', 'session');
    settingStore.grantToolPermission('insert_at_cursor', 'always');

    vi.resetModules();
    setActivePinia(createPinia());

    const { useSettingStore: useReloadedSettingStore } = await import('@/stores/setting');
    const reloadedSettingStore = useReloadedSettingStore();

    expect(reloadedSettingStore.alwaysToolPermissionGrants.insert_at_cursor).toBe(true);
    expect(reloadedSettingStore.sessionToolPermissionGrants.update_settings).toBeUndefined();
  });

  it('revokes and clears persisted and session grants', async () => {
    const { useSettingStore } = await import('@/stores/setting');
    const settingStore = useSettingStore();

    settingStore.grantToolPermission('update_settings', 'session');
    settingStore.grantToolPermission('insert_at_cursor', 'always');
    settingStore.revokeToolPermission('update_settings');

    expect(settingStore.sessionToolPermissionGrants.update_settings).toBeUndefined();

    settingStore.clearToolPermissionGrants();

    expect(settingStore.alwaysToolPermissionGrants).toEqual({});
    expect(settingStore.sessionToolPermissionGrants).toEqual({});
  });

  it('clears only session grants when requested', async () => {
    const { useSettingStore } = await import('@/stores/setting');
    const settingStore = useSettingStore();

    settingStore.grantToolPermission('update_settings', 'session');
    settingStore.grantToolPermission('insert_at_cursor', 'always');
    settingStore.clearSessionToolPermissionGrants();

    expect(settingStore.sessionToolPermissionGrants).toEqual({});
    expect(settingStore.alwaysToolPermissionGrants.insert_at_cursor).toBe(true);
  });

  it('persists editor page width into app settings', async () => {
    const { useSettingStore } = await import('@/stores/setting');
    const settingStore = useSettingStore();

    settingStore.setEditorPageWidth('wide');

    expect(settingStore.editorPageWidth).toBe('wide');
    expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toContain('"editorPageWidth":"wide"');
  });

  it('restores editor page width from persisted app settings', async () => {
    const { local } = await import('@/shared/storage/base');

    local.setItem(SETTINGS_STORAGE_KEY, {
      chatSidebarActiveSessionId: null,
      providerSidebarCollapsed: false,
      settingsSidebarCollapsed: false,
      theme: 'system',
      showOutline: true,
      sourceMode: false,
      editorPageWidth: 'full',
      sidebarVisible: false,
      sidebarWidth: 340,
      toolPermissionMode: 'ask',
      alwaysToolPermissionGrants: {}
    });

    const { useSettingStore } = await import('@/stores/setting');
    const settingStore = useSettingStore();

    expect(settingStore.editorPageWidth).toBe('full');
  });

  it('falls back to default editor page width when persisted value is invalid', async () => {
    const { local } = await import('@/shared/storage/base');

    local.setItem(SETTINGS_STORAGE_KEY, {
      chatSidebarActiveSessionId: null,
      providerSidebarCollapsed: false,
      settingsSidebarCollapsed: false,
      theme: 'system',
      showOutline: true,
      sourceMode: false,
      editorPageWidth: 'giant',
      sidebarVisible: false,
      sidebarWidth: 340,
      toolPermissionMode: 'ask',
      alwaysToolPermissionGrants: {}
    });

    const { useSettingStore } = await import('@/stores/setting');
    const settingStore = useSettingStore();

    expect(settingStore.editorPageWidth).toBe('default');
  });
});
