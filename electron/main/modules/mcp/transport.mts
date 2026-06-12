/**
 * @file transport.mts
 * @description MCP Transport 工厂，根据配置创建对应的 SDK Transport 实例。
 */
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type { MCPServerConfig } from 'types/ai';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

/**
 * Transport 创建选项。
 */
export interface TransportOptions {
  /** OAuth Provider（仅 HTTP/SSE 需要） */
  authProvider?: OAuthClientProvider;
  /** 连接超时（ms） */
  timeout?: number;
}

/**
 * 创建 MCP Transport 实例。
 * SSE 已弃用，统一使用 StreamableHTTPClientTransport（内置 SSE 回退）。
 * @param server - MCP server 配置
 * @param options - 可选创建选项
 * @returns SDK Transport 实例
 */
export function createTransport(server: MCPServerConfig, options?: TransportOptions) {
  switch (server.transport) {
    case 'stdio': {
      if (!server.command.trim()) {
        throw new Error('Command is required for stdio transport');
      }
      return new StdioClientTransport({
        command: server.command,
        args: server.args,
        env: server.env
      });
    }

    case 'streamableHTTP':
    case 'sse': {
      if (!server.url?.trim()) {
        throw new Error('URL is required for remote transport');
      }
      // SSEClientTransport 已被 SDK 标记弃用。
      // StreamableHTTPClientTransport 内置 SSE 回退机制（_startOrAuthSse），
      // 当服务端仅支持 SSE 时会自动降级，因此 transport: 'sse' 也统一使用此类。
      return new StreamableHTTPClientTransport(new URL(server.url), {
        authProvider: options?.authProvider,
        requestInit: {
          headers: server.headers,
          signal: AbortSignal.timeout(options?.timeout ?? server.connectTimeoutMs)
        }
      });
    }

    default:
      throw new Error(`Unknown transport type: ${server.transport}`);
  }
}
