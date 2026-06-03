/**
 * @file sqlite.ts
 * @description 工具设置的本地持久化与归一化实现，MCP 配置写入 ~/.tibis/settings.json。
 */
import type { TavilyToolSettings, ToolSettingsState, MCPToolSettings, MCPServerConfig, MCPOAuthConfig } from './types';
import { local } from '@/shared/storage/base';
import { settingsFileStorage } from '@/shared/storage/settings';
import { asyncTo } from '@/utils/asyncTo';
import {
  DEFAULT_TOOL_SETTINGS,
  DEFAULT_MCP_TOOL_SETTINGS,
  TOOL_SETTINGS_STORAGE_KEY,
  DEFAULT_MCP_CONNECT_TIMEOUT_MS,
  DEFAULT_MCP_TOOL_CALL_TIMEOUT_MS,
  MIN_CONNECT_TIMEOUT_MS,
  MAX_CONNECT_TIMEOUT_MS,
  MIN_TOOL_CALL_TIMEOUT_MS,
  MAX_TOOL_CALL_TIMEOUT_MS
} from './types';

/**
 * 归一化 Tavily 设置。
 * @param value - 原始设置
 * @returns 合法 Tavily 设置
 */
function normalizeTavilySettings(value: unknown): TavilyToolSettings {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? (value as Partial<TavilyToolSettings>) : {};

  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : DEFAULT_TOOL_SETTINGS.tavily.enabled,
    apiKey: typeof source.apiKey === 'string' ? source.apiKey : DEFAULT_TOOL_SETTINGS.tavily.apiKey
  };
}

// ─── MCP Normalization Helpers ─────────────────────────────────────────────────

/**
 * 归一化 timeout 值到合理范围。
 */
function normalizeTimeoutMs(value: unknown, defaultMs: number, minMs: number, maxMs: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return defaultMs;
  }
  return Math.min(maxMs, Math.max(minMs, Math.round(value)));
}

/**
 * 归一化 env 字典。
 */
function normalizeEnv(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (key.trim().length > 0 && typeof val === 'string') {
      result[key] = val;
    }
  }
  return result;
}

/**
 * 归一化 OAuth 配置。
 */
function normalizeOAuthConfig(value: unknown): MCPOAuthConfig | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const source = value as Partial<MCPOAuthConfig>;
  return {
    clientId: typeof source.clientId === 'string' ? source.clientId : undefined,
    clientSecret: typeof source.clientSecret === 'string' ? source.clientSecret : undefined,
    accessToken: typeof source.accessToken === 'string' ? source.accessToken : undefined,
    refreshToken: typeof source.refreshToken === 'string' ? source.refreshToken : undefined,
    expiresAt: typeof source.expiresAt === 'number' ? source.expiresAt : undefined,
    scope: typeof source.scope === 'string' ? source.scope : undefined
  };
}

/**
 * 归一化单个 MCP server 配置。
 */
function normalizeMCPServerConfig(value: unknown): MCPServerConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const source = value as Partial<MCPServerConfig>;

  if (!source.id?.trim()) return null;

  const transport = source.transport === 'streamableHTTP' || source.transport === 'sse' ? source.transport : 'stdio';
  const args = Array.isArray(source.args) ? source.args.filter((a: unknown): a is string => typeof a === 'string') : [];

  return {
    id: source.id.trim(),
    name: source.name?.trim() || source.command?.trim() || 'Unnamed MCP Server',
    enabled: Boolean(source.enabled),
    transport,
    url: transport !== 'stdio' && typeof source.url === 'string' ? source.url.trim() : undefined,
    command: typeof source.command === 'string' ? source.command.trim() : '',
    args,
    env: normalizeEnv(source.env),
    toolAllowlist: Array.isArray(source.toolAllowlist)
      ? [...new Set(source.toolAllowlist.filter((t: unknown): t is string => typeof t === 'string' && t.trim().length > 0).map((t: string) => t.trim()))]
      : [],
    oauth: normalizeOAuthConfig(source.oauth),
    watchToolChanges: typeof source.watchToolChanges === 'boolean' ? source.watchToolChanges : undefined,
    connectTimeoutMs: normalizeTimeoutMs(source.connectTimeoutMs, DEFAULT_MCP_CONNECT_TIMEOUT_MS, MIN_CONNECT_TIMEOUT_MS, MAX_CONNECT_TIMEOUT_MS),
    toolCallTimeoutMs: normalizeTimeoutMs(source.toolCallTimeoutMs, DEFAULT_MCP_TOOL_CALL_TIMEOUT_MS, MIN_TOOL_CALL_TIMEOUT_MS, MAX_TOOL_CALL_TIMEOUT_MS)
  };
}

/**
 * 归一化 MCP 工具设置。
 */
export function normalizeMCPSettings(value: unknown): MCPToolSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return DEFAULT_MCP_TOOL_SETTINGS;
  }
  const source = value as Partial<MCPToolSettings>;

  return {
    servers: Array.isArray(source.servers) ? source.servers.map((s) => normalizeMCPServerConfig(s)).filter((s): s is MCPServerConfig => s !== null) : []
  };
}

/**
 * 归一化全部工具设置。
 * @param value - 原始持久化值
 * @returns 合法工具设置
 */
export function normalizeToolSettings(value: unknown): ToolSettingsState {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? (value as Partial<ToolSettingsState>) : {};

  return {
    tavily: normalizeTavilySettings(source.tavily),
    mcp: normalizeMCPSettings(source.mcp)
  };
}

/**
 * Tavily 工具设置存储。
 */
export const toolSettingsStorage = {
  /**
   * 读取设置。
   * @returns 归一化后的工具设置
   */
  getSettings(): ToolSettingsState {
    const saved = local.getItem<ToolSettingsState>(TOOL_SETTINGS_STORAGE_KEY);
    const normalized = normalizeToolSettings({ tavily: saved?.tavily });
    local.setItem(TOOL_SETTINGS_STORAGE_KEY, { tavily: normalized.tavily });
    return normalized;
  },

  /**
   * 异步读取完整工具设置。
   * @returns 归一化后的工具设置
   */
  async loadSettings(): Promise<ToolSettingsState> {
    const saved = local.getItem<ToolSettingsState>(TOOL_SETTINGS_STORAGE_KEY);
    const [error, settingsFile] = await asyncTo(settingsFileStorage.read());
    const normalized = normalizeToolSettings({
      tavily: saved?.tavily,
      mcp: error ? undefined : settingsFile.mcp
    });
    local.setItem(TOOL_SETTINGS_STORAGE_KEY, { tavily: normalized.tavily });
    return normalized;
  },

  /**
   * 保存设置。
   * @param settings - 待保存设置
   * @returns 归一化后的工具设置
   */
  async saveSettings(settings: Partial<ToolSettingsState>): Promise<ToolSettingsState> {
    const normalized = normalizeToolSettings(settings);
    local.setItem(TOOL_SETTINGS_STORAGE_KEY, { tavily: normalized.tavily });
    await asyncTo(settingsFileStorage.update((current) => ({ ...current, mcp: normalized.mcp })));
    return normalized;
  }
};
