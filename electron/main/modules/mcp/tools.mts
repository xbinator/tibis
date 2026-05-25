/**
 * @file tools.mts
 * @description MCP 工具发现结果的主进程过滤边界。
 */
import type { ToolExecutionOptions, ToolSet } from 'ai';
import type { AIMCPRequestConfig, MCPDiscoveredToolSnapshot, MCPServerConfig, MCPToolSettings, MCPToolSelector } from 'types/ai';
import { jsonSchema, tool } from 'ai';

/**
 * MCP 工具执行请求。
 */
export interface MCPToolExecuteRequest {
  /** 所属 server ID */
  serverId: string;
  /** 原始 MCP tool 名称 */
  toolName: string;
  /** 模型传入的工具参数 */
  input: unknown;
}

/**
 * MCP 工具执行函数。
 */
export type MCPToolExecutor = (request: MCPToolExecuteRequest, options?: ToolExecutionOptions) => Promise<unknown>;

/**
 * 判断 server 配置是否完整到可以参与工具暴露（仅检查配置完整性，不检查运行时连接状态）。
 * 运行时连接由 executeMcpTool 内部自动处理（按需重连）。
 * @param server - MCP server 配置
 * @param request - 当前请求的 MCP 配置
 * @returns 是否可参与工具暴露
 */
function isServerRunnableForRequest(server: MCPServerConfig, request: AIMCPRequestConfig): boolean {
  if (!server.enabled || !request.enabledServerIds.includes(server.id)) return false;
  if (server.transport === 'stdio') return server.command.trim().length > 0;
  return Boolean(server.url?.trim());
}

/**
 * 创建 server 级工具白名单集合。
 * @param server - MCP server 配置
 * @returns 白名单集合；空集合表示不限制
 */
function createServerAllowlist(server: MCPServerConfig): Set<string> {
  return new Set(server.toolAllowlist.map((toolName) => toolName.trim()).filter((toolName) => toolName.length > 0));
}

/**
 * 创建请求级工具选择器集合。
 * @param enabledTools - 当前请求允许的工具选择器
 * @returns 请求级工具选择器集合；空集合表示不限制
 */
function createRequestToolSelectorSet(enabledTools: MCPToolSelector[]): Set<string> {
  return new Set(enabledTools.map((selector) => `${selector.serverId}\u0000${selector.toolName}`));
}

/**
 * 判断 discovery 工具是否通过 server 级 allowlist。
 * @param tool - discovery 工具快照
 * @param serverAllowlist - server 级 allowlist
 * @returns 是否允许暴露
 */
function isAllowedByServerAllowlist(discoveredTool: MCPDiscoveredToolSnapshot, serverAllowlist: Set<string>): boolean {
  return serverAllowlist.size === 0 || serverAllowlist.has(discoveredTool.toolName);
}

/**
 * 判断 discovery 工具是否通过请求级选择器。
 * @param tool - discovery 工具快照
 * @param requestToolSelectors - 请求级工具选择器集合
 * @returns 是否允许暴露
 */
function isAllowedByRequestSelectors(discoveredTool: MCPDiscoveredToolSnapshot, requestToolSelectors: Set<string>): boolean {
  return requestToolSelectors.size === 0 || requestToolSelectors.has(`${discoveredTool.serverId}\u0000${discoveredTool.toolName}`);
}

/**
 * 将字符串编码成 AI SDK 工具名可用的十六进制片段。
 * @param value - 原始字符串
 * @returns 十六进制编码片段
 */
function encodeToolNamePart(value: string): string {
  return Buffer.from(value, 'utf8').toString('hex');
}

/**
 * 将 MCP server 与原始 tool 名称转换为 AI SDK 工具名。
 * @param serverId - MCP server ID
 * @param toolName - 原始 MCP tool 名称
 * @returns server-scoped AI SDK 工具名
 */
export function toMcpSdkToolName(serverId: string, toolName: string): string {
  return `mcp_${encodeToolNamePart(serverId)}_${encodeToolNamePart(toolName)}`;
}

/**
 * 解析本次请求最终可暴露的 MCP 工具。
 * @param settings - 全局 MCP 工具设置
 * @param request - 当前请求 MCP 配置
 * @param discoveredTools - 最近一次 discovery 得到的工具快照
 * @returns 已按 server 与请求权限裁剪后的工具列表
 */
export function resolveMcpExposedTools(
  settings: MCPToolSettings,
  request: AIMCPRequestConfig,
  discoveredTools: MCPDiscoveredToolSnapshot[]
): MCPDiscoveredToolSnapshot[] {
  const runnableServers = new Map<string, MCPServerConfig>();
  for (const server of settings.servers) {
    if (isServerRunnableForRequest(server, request)) {
      runnableServers.set(server.id, server);
    }
  }

  const requestToolSelectors = createRequestToolSelectorSet(request.enabledTools);

  return discoveredTools.filter((discoveredTool) => {
    const server = runnableServers.get(discoveredTool.serverId);
    if (!server) return false;

    const serverAllowlist = createServerAllowlist(server);
    return isAllowedByServerAllowlist(discoveredTool, serverAllowlist) && isAllowedByRequestSelectors(discoveredTool, requestToolSelectors);
  });
}

/**
 * 将已过滤的 MCP 工具快照转换为 AI SDK ToolSet。
 * @param exposedTools - 已过滤的 MCP 工具快照
 * @param executeTool - MCP runtime 执行函数
 * @returns AI SDK ToolSet
 */
export function createMcpSdkTools(exposedTools: MCPDiscoveredToolSnapshot[], executeTool: MCPToolExecutor): ToolSet {
  const entries = exposedTools.map((exposedTool) => {
    const sdkToolName = toMcpSdkToolName(exposedTool.serverId, exposedTool.toolName);

    return [
      sdkToolName,
      tool({
        description: exposedTool.description ?? `MCP tool ${exposedTool.toolName} from server ${exposedTool.serverId}.`,
        inputSchema: jsonSchema(
          exposedTool.inputSchema ?? {
            type: 'object',
            properties: {},
            additionalProperties: true
          }
        ),
        execute: async (input: unknown, options: ToolExecutionOptions) =>
          executeTool(
            {
              serverId: exposedTool.serverId,
              toolName: exposedTool.toolName,
              input
            },
            options
          )
      })
    ] as const;
  });

  return Object.fromEntries(entries);
}
