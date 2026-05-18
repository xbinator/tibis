/**
 * @file toolPermission.test.ts
 * @description AI 工具权限 Store 测试，验证权限模式、授权记录持久化和迁移行为。
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const TOOL_PERMISSION_STORAGE_KEY = 'tool_permission';
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

describe('useToolPermissionStore', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('returns defaults when no persisted data exists', async () => {
    const { useToolPermissionStore } = await import('@/stores/chat/toolPermission');
    const store = useToolPermissionStore();

    expect(store.toolPermissionMode).toBe('ask');
    expect(store.alwaysToolPermissionGrants).toEqual({});
    expect(store.sessionToolPermissionGrants).toEqual({});
  });

  it('persists tool permission mode changes', async () => {
    const { useToolPermissionStore } = await import('@/stores/chat/toolPermission');
    const store = useToolPermissionStore();

    store.setToolPermissionMode('autoSafe');

    expect(store.toolPermissionMode).toBe('autoSafe');
    expect(localStorage.getItem(TOOL_PERMISSION_STORAGE_KEY)).toContain('"toolPermissionMode":"autoSafe"');
  });

  it('stores always grants separately from session grants and clears session when always is granted', async () => {
    const { useToolPermissionStore } = await import('@/stores/chat/toolPermission');
    const store = useToolPermissionStore();

    store.grantToolPermission('update_settings', 'session');
    expect(store.sessionToolPermissionGrants.update_settings).toBe(true);

    store.grantToolPermission('update_settings', 'always');

    expect(store.alwaysToolPermissionGrants.update_settings).toBe(true);
    expect(store.sessionToolPermissionGrants.update_settings).toBeUndefined();
    expect(localStorage.getItem(TOOL_PERMISSION_STORAGE_KEY)).toContain('"alwaysToolPermissionGrants":{"update_settings":true}');
  });

  it('does not restore session grants from persisted data', async () => {
    const { useToolPermissionStore } = await import('@/stores/chat/toolPermission');
    const store = useToolPermissionStore();

    store.grantToolPermission('update_settings', 'session');
    store.grantToolPermission('insert_at_cursor', 'always');

    vi.resetModules();
    setActivePinia(createPinia());

    const { useToolPermissionStore: useReloaded } = await import('@/stores/chat/toolPermission');
    const reloaded = useReloaded();

    expect(reloaded.alwaysToolPermissionGrants.insert_at_cursor).toBe(true);
    expect(reloaded.sessionToolPermissionGrants.update_settings).toBeUndefined();
  });

  it('revokes and clears persisted and session grants', async () => {
    const { useToolPermissionStore } = await import('@/stores/chat/toolPermission');
    const store = useToolPermissionStore();

    store.grantToolPermission('update_settings', 'session');
    store.grantToolPermission('insert_at_cursor', 'always');
    store.revokeToolPermission('update_settings');

    expect(store.sessionToolPermissionGrants.update_settings).toBeUndefined();

    store.clearToolPermissionGrants();

    expect(store.alwaysToolPermissionGrants).toEqual({});
    expect(store.sessionToolPermissionGrants).toEqual({});
  });

  it('clears only session grants when requested', async () => {
    const { useToolPermissionStore } = await import('@/stores/chat/toolPermission');
    const store = useToolPermissionStore();

    store.grantToolPermission('update_settings', 'session');
    store.grantToolPermission('insert_at_cursor', 'always');
    store.clearSessionToolPermissionGrants();

    expect(store.sessionToolPermissionGrants).toEqual({});
    expect(store.alwaysToolPermissionGrants.insert_at_cursor).toBe(true);
  });

  it('migrates tool permission data from legacy app_settings key', async () => {
    const { local } = await import('@/shared/storage/base');

    local.setItem(SETTINGS_STORAGE_KEY, {
      chatSidebarActiveSessionId: null,
      providerSidebarCollapsed: false,
      settingsSidebarCollapsed: false,
      theme: 'system',
      sidebarVisible: false,
      sidebarWidth: 340,
      toolPermissionMode: 'autoSafe',
      alwaysToolPermissionGrants: { read_file: true }
    });

    const { useToolPermissionStore } = await import('@/stores/chat/toolPermission');
    const store = useToolPermissionStore();

    expect(store.toolPermissionMode).toBe('autoSafe');
    expect(store.alwaysToolPermissionGrants.read_file).toBe(true);
    expect(localStorage.getItem(TOOL_PERMISSION_STORAGE_KEY)).toContain('"toolPermissionMode":"autoSafe"');
  });
});
