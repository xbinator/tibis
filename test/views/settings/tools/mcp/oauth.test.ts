/**
 * @file oauth.test.ts
 * @description 验证 MCP OAuth 授权流程会主动打开授权 URL。
 */
import type { MCPServerConfig } from 'types/ai';
import { describe, expect, it, vi } from 'vitest';
import { startMcpOAuthFlow, type McpOAuthAPI } from '@/views/settings/tools/mcp/utils/oauth';

/**
 * 创建测试用 MCP server。
 * @returns MCP server 配置
 */
function createMcpServer(): MCPServerConfig {
  return {
    id: 'mcp-server',
    name: 'MCP Server',
    enabled: true,
    transport: 'streamableHTTP',
    url: 'https://example.com/mcp',
    command: '',
    args: [],
    env: {},
    headers: {},
    toolAllowlist: [],
    connectTimeoutMs: 10_000,
    toolCallTimeoutMs: 60_000,
    oauth: {}
  };
}

describe('startMcpOAuthFlow', () => {
  it('opens the authorization URL returned by the main process', async (): Promise<void> => {
    const api: McpOAuthAPI = {
      startMcpOAuth: vi.fn<(_server: MCPServerConfig) => Promise<{ authorizationUrl: string }>>().mockResolvedValue({
        authorizationUrl: 'https://auth.example.com/authorize'
      }),
      openExternal: vi.fn<(_url: string) => Promise<void>>().mockResolvedValue(undefined)
    };
    const server = createMcpServer();

    await startMcpOAuthFlow(api, server);

    expect(api.startMcpOAuth).toHaveBeenCalledWith(server);
    expect(api.openExternal).toHaveBeenCalledWith('https://auth.example.com/authorize');
  });

  it('does not open a browser when no authorization URL is returned', async (): Promise<void> => {
    const api: McpOAuthAPI = {
      startMcpOAuth: vi.fn<(_server: MCPServerConfig) => Promise<{ authorizationUrl: string }>>().mockResolvedValue({
        authorizationUrl: ''
      }),
      openExternal: vi.fn<(_url: string) => Promise<void>>().mockResolvedValue(undefined)
    };

    await startMcpOAuthFlow(api, createMcpServer());

    expect(api.openExternal).not.toHaveBeenCalled();
  });
});
