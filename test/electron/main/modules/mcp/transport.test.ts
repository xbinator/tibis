/**
 * @file transport.test.ts
 * @description 验证 MCP transport 工厂对远程请求头的传递。
 */
import type { MCPServerConfig } from 'types/ai';
import { describe, expect, it } from 'vitest';
import { createTransport } from '../../../../../electron/main/modules/mcp/transport.mts';

/**
 * 带请求头的 MCP server 配置。
 */
type HeaderAwareMcpServerConfig = MCPServerConfig & {
  /** 远程 MCP 请求头 */
  headers: Record<string, string>;
};

/**
 * 暴露 SDK transport 内部 requestInit 的测试接口。
 */
interface RequestInitCarrier {
  /** SDK transport 保存的 fetch 初始化参数 */
  _requestInit?: RequestInit;
}

/**
 * 创建远程 MCP server 测试配置。
 * @returns MCP server 配置
 */
function createRemoteServer(): HeaderAwareMcpServerConfig {
  return {
    id: 'coffee-server',
    name: 'Coffee Server',
    enabled: true,
    transport: 'streamableHTTP',
    url: 'https://gwmcp.lkcoffee.com/order/user/mcp',
    command: '',
    args: [],
    env: {},
    headers: {
      Authorization: 'Bearer test-token'
    },
    toolAllowlist: [],
    connectTimeoutMs: 30000,
    toolCallTimeoutMs: 60000
  };
}

describe('createTransport', () => {
  it('passes configured headers to streamable HTTP requestInit', (): void => {
    const transport = createTransport(createRemoteServer()) as unknown as RequestInitCarrier;

    expect(transport._requestInit?.headers).toMatchObject({
      Authorization: 'Bearer test-token'
    });
  });
});
