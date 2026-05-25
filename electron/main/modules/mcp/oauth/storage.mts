/**
 * @file storage.mts
 * @description MCP OAuth Token 持久化，使用 Electron Store 存储。
 */
import { log } from '../../logger/service.mjs';
import { getStore } from '../../store/service.mjs';

/**
 * OAuth 持久化数据结构。
 */
interface OAuthData {
  serverId: string;
  serverUrl: string;
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
  codeVerifier?: string;
  /** OAuth CSRF state 参数 */
  state?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * OAuth 数据存储键前缀。
 */
const OAUTH_STORE_PREFIX = 'mcp:oauth:';

/**
 * 安全读取 OAuth 数据。
 * @param serverId - MCP server ID
 * @returns OAuth 数据或 null
 */
export function loadOAuthData(serverId: string): OAuthData | null {
  try {
    const store = getStore();
    const key = `${OAUTH_STORE_PREFIX}${serverId}`;
    const data = store.get(key) as OAuthData | undefined;
    return data ?? null;
  } catch (error) {
    log.error(`Failed to load OAuth data for ${serverId}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * 安全写入 OAuth 数据。
 * @param data - OAuth 数据
 */
export function saveOAuthData(data: OAuthData): void {
  try {
    const store = getStore();
    const key = `${OAUTH_STORE_PREFIX}${data.serverId}`;
    store.set(key, { ...data, updatedAt: Date.now() });
  } catch (error) {
    log.error(`Failed to save OAuth data for ${data.serverId}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * 清除指定 server 的 OAuth 数据。
 * @param serverId - MCP server ID
 */
export function clearOAuthData(serverId: string): void {
  try {
    const store = getStore();
    const key = `${OAUTH_STORE_PREFIX}${serverId}`;
    store.delete(key);
  } catch (error) {
    log.error(`Failed to clear OAuth data for ${serverId}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
