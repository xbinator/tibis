/**
 * @file toolSettings.test.ts
 * @description 验证 Tavily 工具设置 store 的默认值、归一化与可用性派生状态。
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const TOOL_SETTINGS_STORAGE_KEY = 'tool_settings';
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

describe('useToolSettingsStore', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('loads Tavily defaults and keeps country = china', async () => {
    const { useToolSettingsStore } = await import('@/stores/ai/toolSettings');
    const store = useToolSettingsStore();

    expect(store.tavily.enabled).toBe(false);
    expect(store.tavily.searchDefaults.country).toBe('china');
    expect(store.isTavilyAvailable).toBe(false);
  });

  it('normalizes invalid persisted values back to defaults', async () => {
    const { local } = await import('@/shared/storage/base');

    local.setItem(TOOL_SETTINGS_STORAGE_KEY, {
      tavily: {
        enabled: 'yes',
        apiKey: 123,
        searchDefaults: {
          topic: 'sports',
          timeRange: 'forever',
          country: 'CN',
          maxResults: 99,
          includeDomains: [' example.com ', '', 'https://bad.example.com']
        }
      }
    });

    const { useToolSettingsStore } = await import('@/stores/ai/toolSettings');
    const store = useToolSettingsStore();

    expect(store.tavily.enabled).toBe(false);
    expect(store.tavily.apiKey).toBe('');
    expect(store.tavily.searchDefaults.topic).toBe('general');
    expect(store.tavily.searchDefaults.timeRange).toBeNull();
    expect(store.tavily.searchDefaults.country).toBe('china');
    expect(store.tavily.searchDefaults.maxResults).toBe(20);
    expect(store.tavily.searchDefaults.includeDomains).toEqual(['example.com']);
  });

  it('marks Tavily available only when enabled and apiKey is present', async () => {
    const { useToolSettingsStore } = await import('@/stores/ai/toolSettings');
    const store = useToolSettingsStore();

    store.setTavilyEnabled(true);
    expect(store.isTavilyAvailable).toBe(false);

    store.setTavilyApiKey('tvly-dev-key');
    expect(store.isTavilyAvailable).toBe(true);
  });

  it('loads MCP defaults and derives enabled server availability', async () => {
    const { useToolSettingsStore } = await import('@/stores/ai/toolSettings');
    const store = useToolSettingsStore();

    expect(store.mcp.servers).toEqual([]);
    expect(store.hasEnabledMcpServers).toBe(false);
  });

  it('updates MCP servers through normalized persistence', async () => {
    const { useToolSettingsStore } = await import('@/stores/ai/toolSettings');
    const store = useToolSettingsStore();

    store.addMcpServer({
      id: 'server-1',
      name: 'Filesystem',
      enabled: true,
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem'],
      env: { API_KEY: 'secret' },
      toolAllowlist: ['read_file', 'read_file', 'write_file'],
      connectTimeoutMs: 20000,
      toolCallTimeoutMs: 30000
    });

    expect(store.hasEnabledMcpServers).toBe(true);
    expect(store.getMcpServerById('server-1')?.toolAllowlist).toEqual(['read_file', 'write_file']);

    store.updateMcpServer('server-1', { enabled: false, toolAllowlist: ['list_directory'] });
    expect(store.hasEnabledMcpServers).toBe(false);
    expect(store.getMcpServerById('server-1')?.toolAllowlist).toEqual(['list_directory']);

    store.removeMcpServer('server-1');
    expect(store.mcp.servers).toEqual([]);
  });
});
