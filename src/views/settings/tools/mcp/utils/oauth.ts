/**
 * @file oauth.ts
 * @description MCP OAuth 授权流程工具。
 */
import type { MCPServerConfig } from 'types/ai';

/**
 * MCP OAuth 所需的 Electron API 子集。
 */
export interface McpOAuthAPI {
  /** 启动 MCP OAuth 流程。 */
  startMcpOAuth(server: MCPServerConfig): Promise<{ authorizationUrl: string }>;
  /** 使用系统浏览器打开外部链接。 */
  openExternal(url: string): Promise<void>;
}

/**
 * 启动 MCP OAuth 流程，并主动打开主进程返回的授权地址。
 * @param api - Electron API 子集
 * @param server - MCP server 配置
 */
export async function startMcpOAuthFlow(api: McpOAuthAPI, server: MCPServerConfig): Promise<void> {
  const result = await api.startMcpOAuth(server);
  if (result.authorizationUrl.trim().length === 0) return;

  await api.openExternal(result.authorizationUrl);
}
