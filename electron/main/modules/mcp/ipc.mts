/**
 * @file ipc.mts
 * @description MCP runtime IPC 处理器。
 */
import type { MCPServerConfig } from 'types/ai';
import { ipcMain } from 'electron';
import { connectMcpServer, disconnectMcpServer, getMcpDiscoveryCache, getMcpStatus, refreshMcpDiscovery, restartMcpServer } from './runtime.mjs';

/**
 * 注册 MCP runtime IPC 通道。
 */
export function registerMcpHandlers(): void {
  ipcMain.handle('tools:mcp:get-status', (_event, serverIds: string[]) => getMcpStatus(serverIds));
  ipcMain.handle('tools:mcp:get-discovery-cache', (_event, serverId?: string) => getMcpDiscoveryCache(serverId));
  ipcMain.handle('tools:mcp:refresh-discovery', async (_event, server: MCPServerConfig) => refreshMcpDiscovery(server));
  ipcMain.handle('tools:mcp:connect', async (_event, server: MCPServerConfig) => connectMcpServer(server));
  ipcMain.handle('tools:mcp:disconnect', (_event, serverId: string) => disconnectMcpServer(serverId));
  ipcMain.handle('tools:mcp:restart', async (_event, server: MCPServerConfig) => restartMcpServer(server));
}
