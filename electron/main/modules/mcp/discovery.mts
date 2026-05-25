/**
 * @file discovery.mts
 * @description MCP 工具发现与缓存管理。
 */
import type { MCPDiscoveredToolSnapshot, MCPDiscoveryRefreshResult, MCPServerDiscoveryCache } from 'types/ai';

const discoveryCacheByServerId = new Map<string, MCPServerDiscoveryCache>();

/**
 * 获取指定 server 的 discovery cache。
 * @param serverId - server ID，不传时返回全部
 * @returns discovery cache
 */
export function getDiscoveryCache(serverId?: string): MCPServerDiscoveryCache | MCPServerDiscoveryCache[] | undefined {
  if (serverId) {
    return discoveryCacheByServerId.get(serverId);
  }
  return [...discoveryCacheByServerId.values()];
}

/**
 * 存储 discovery cache。
 * @param cache - discovery cache
 */
export function setDiscoveryCache(cache: MCPServerDiscoveryCache): void {
  discoveryCacheByServerId.set(cache.serverId, cache);
}

/**
 * 删除指定 server 的 discovery cache。
 * @param serverId - server ID
 */
export function deleteDiscoveryCache(serverId: string): void {
  discoveryCacheByServerId.delete(serverId);
}

/**
 * 清除所有 discovery cache。
 */
export function clearAllDiscoveryCache(): void {
  discoveryCacheByServerId.clear();
}

/**
 * 创建 discovery 刷新成功结果。
 * @param serverId - server ID
 * @param tools - 发现的工具列表
 * @param now - 当前时间戳
 * @returns 成功结果
 */
export function createDiscoverySuccessResult(serverId: string, tools: MCPDiscoveredToolSnapshot[], now: number): MCPDiscoveryRefreshResult {
  const cache: MCPServerDiscoveryCache = { serverId, tools, discoveredAt: now };
  setDiscoveryCache(cache);
  return { ok: true, serverId, cache };
}

/**
 * 创建 discovery 刷新失败结果。
 * @param serverId - server ID
 * @param errorCode - 错误码
 * @param message - 错误消息
 * @returns 失败结果
 */
export function createDiscoveryFailureResult(serverId: string, errorCode: string, message: string): MCPDiscoveryRefreshResult {
  return { ok: false, serverId, errorCode, message };
}
