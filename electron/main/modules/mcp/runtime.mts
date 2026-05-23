/**
 * @file runtime.mts
 * @description MCP server 本地执行状态与 discovery cache 管理。
 */
import type { MCPDiscoveredToolSnapshot, MCPDiscoveryRefreshResult, MCPServerConfig, MCPServerDiscoveryCache, MCPStatusResponse } from 'types/ai';
import { createMcpStdioSession, executeMcpToolLocally, type MCPLocalSession, type MCPLocalSpawn } from './local-stdio.mjs';

/**
 * MCP discovery provider。
 */
export type MCPDiscoveryProvider = (server: MCPServerConfig) => Promise<MCPDiscoveredToolSnapshot[]>;

/**
 * MCP tool 执行 provider。
 */
export type MCPToolExecutionProvider = (server: MCPServerConfig, toolName: string, input: unknown) => Promise<unknown>;

/**
 * MCP 本地 session 创建 provider。
 */
export type MCPSessionProvider = (server: MCPServerConfig) => Promise<MCPLocalSession>;

/**
 * MCP discovery 刷新依赖。
 */
export interface MCPDiscoveryRefreshDependencies {
  /** 本地 spawn 注入点 */
  spawnProcess?: MCPLocalSpawn;
  /** discovery provider 注入点 */
  discoverTools?: MCPDiscoveryProvider;
  /** 本地 session 创建注入点 */
  createSession?: MCPSessionProvider;
  /** 当前时间注入点 */
  now?: () => number;
}

/**
 * MCP tool 执行依赖。
 */
export interface MCPToolExecutionDependencies {
  /** 本地 spawn 注入点 */
  spawnProcess?: MCPLocalSpawn;
  /** tool execute provider 注入点 */
  executeTool?: MCPToolExecutionProvider;
  /** 本地 session 创建注入点 */
  createSession?: MCPSessionProvider;
  /** 当前时间注入点 */
  now?: () => number;
}

const statusByServerId = new Map<string, MCPStatusResponse>();
const discoveryCacheByServerId = new Map<string, MCPServerDiscoveryCache>();
const sessionsByServerId = new Map<string, MCPLocalSession>();
const sessionSignatureByServerId = new Map<string, string>();

/**
 * 获取 server 状态，没有状态时返回 idle。
 * @param serverId - server ID
 * @returns MCP 状态
 */
function getStatusOrIdle(serverId: string): MCPStatusResponse {
  return (
    statusByServerId.get(serverId) ?? {
      serverId,
      runtimeStatus: 'idle',
      sandboxStatus: 'idle',
      discoveryStatus: 'idle'
    }
  );
}

/**
 * 更新 server 状态。
 * @param status - 新状态
 */
function setStatus(status: MCPStatusResponse): void {
  statusByServerId.set(status.serverId, status);
}

/**
 * 创建兼容旧 sandbox 字段的 MCP 状态对象。
 * @param serverId - server ID
 * @param runtimeStatus - runtime 状态
 * @param discoveryStatus - discovery 状态
 * @param message - 状态说明
 * @returns MCP 状态响应
 */
function createStatus(
  serverId: string,
  runtimeStatus: MCPStatusResponse['runtimeStatus'],
  discoveryStatus: MCPStatusResponse['discoveryStatus'],
  message?: string
): MCPStatusResponse {
  const sandboxStatusByRuntime: Record<MCPStatusResponse['runtimeStatus'], MCPStatusResponse['sandboxStatus']> = {
    idle: 'idle',
    connecting: 'starting',
    connected: 'running',
    failed: 'failed',
    disabled: 'idle'
  };

  return {
    serverId,
    runtimeStatus,
    sandboxStatus: sandboxStatusByRuntime[runtimeStatus],
    discoveryStatus,
    ...(message ? { message } : {})
  };
}

/**
 * 创建影响 stdio 子进程启动与请求超时的配置指纹。
 * @param server - MCP server 配置
 * @returns 可比较的稳定配置指纹
 */
function createServerSessionSignature(server: MCPServerConfig): string {
  const envEntries = Object.entries(server.env).sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
  return JSON.stringify({
    enabled: server.enabled,
    transport: server.transport,
    command: server.command,
    args: server.args,
    env: envEntries,
    connectTimeoutMs: server.connectTimeoutMs,
    toolCallTimeoutMs: server.toolCallTimeoutMs
  });
}

/**
 * 将未知本地执行错误归类为稳定错误码。
 * @param error - 原始错误
 * @returns 稳定错误码与消息
 */
function classifyMcpLocalError(error: unknown): { code: string; message: string } {
  const message = error instanceof Error ? error.message : String(error);
  if (message.toLowerCase().includes('timed out')) {
    return { code: 'LOCAL_EXEC_TIMEOUT', message };
  }
  return { code: 'LOCAL_EXEC_FAILED', message };
}

/**
 * 默认 tool execute provider。
 * @param server - MCP server 配置
 * @param toolName - MCP tool 名称
 * @param input - Tool 输入
 * @param spawnProcess - 本地 spawn 注入点
 * @returns MCP tool 调用结果
 */
async function executeMcpToolWithLocalRunner(server: MCPServerConfig, toolName: string, input: unknown, spawnProcess?: MCPLocalSpawn): Promise<unknown> {
  return executeMcpToolLocally(server, toolName, input, spawnProcess);
}

/**
 * 默认本地 session provider。
 * @param server - MCP server 配置
 * @param spawnProcess - 本地 spawn 注入点
 * @returns 已初始化的本地 MCP session
 */
async function createMcpSessionWithLocalRunner(server: MCPServerConfig, spawnProcess?: MCPLocalSpawn): Promise<MCPLocalSession> {
  return createMcpStdioSession(server, spawnProcess);
}

/**
 * 关闭并移除指定 server 的 live session。
 * @param serverId - server ID
 */
function closeSession(serverId: string): void {
  const session = sessionsByServerId.get(serverId);
  sessionSignatureByServerId.delete(serverId);
  if (!session) return;
  sessionsByServerId.delete(serverId);
  session.close();
}

/**
 * 判断 server 是否可尝试连接。
 * @param server - MCP server 配置
 * @returns 不可连接时的状态说明，空表示可连接
 */
function getServerRunnableError(server: MCPServerConfig): string {
  if (!server.enabled) {
    return `MCP server is disabled: ${server.id}`;
  }
  if (!server.command.trim()) {
    return `MCP server command is empty: ${server.id}`;
  }
  return '';
}

/**
 * 重置 MCP runtime 内存状态，主要用于测试和应用重新初始化。
 */
export function resetMcpRuntimeState(): void {
  for (const serverId of sessionsByServerId.keys()) {
    closeSession(serverId);
  }
  statusByServerId.clear();
  discoveryCacheByServerId.clear();
}

/**
 * 查询一个或多个 MCP server 状态。
 * @param serverIds - server ID 列表
 * @returns 状态列表
 */
export function getMcpStatus(serverIds: string[]): MCPStatusResponse[] {
  return serverIds.map((serverId) => getStatusOrIdle(serverId));
}

/**
 * 读取 discovery cache。
 * @param serverId - 可选 server ID
 * @returns 单个 cache 或全部 cache
 */
export function getMcpDiscoveryCache(serverId?: string): MCPServerDiscoveryCache | MCPServerDiscoveryCache[] | undefined {
  if (serverId) {
    return discoveryCacheByServerId.get(serverId);
  }
  return [...discoveryCacheByServerId.values()];
}

/**
 * 连接指定 MCP server 并刷新 discovery cache。
 * @param server - MCP server 配置
 * @param dependencies - 可注入依赖
 * @returns discovery 刷新结果
 */
export async function connectMcpServer(server: MCPServerConfig, dependencies: MCPDiscoveryRefreshDependencies = {}): Promise<MCPDiscoveryRefreshResult> {
  const runnableError = getServerRunnableError(server);
  if (runnableError) {
    setStatus(createStatus(server.id, server.enabled ? 'failed' : 'disabled', 'failed', runnableError));
    return {
      ok: false,
      serverId: server.id,
      errorCode: 'LOCAL_EXEC_FAILED',
      message: runnableError
    };
  }

  setStatus(createStatus(server.id, 'connecting', 'refreshing'));

  try {
    const sessionSignature = createServerSessionSignature(server);
    if (sessionsByServerId.has(server.id) && sessionSignatureByServerId.get(server.id) !== sessionSignature) {
      closeSession(server.id);
    }

    const existingSession = sessionsByServerId.get(server.id);
    const session =
      existingSession ??
      (dependencies.createSession ? await dependencies.createSession(server) : await createMcpSessionWithLocalRunner(server, dependencies.spawnProcess));
    sessionsByServerId.set(server.id, session);
    sessionSignatureByServerId.set(server.id, sessionSignature);

    const tools = dependencies.discoverTools ? await dependencies.discoverTools(server) : await session.listTools();
    const cache: MCPServerDiscoveryCache = {
      serverId: server.id,
      tools,
      discoveredAt: dependencies.now?.() ?? Date.now()
    };

    discoveryCacheByServerId.set(server.id, cache);
    setStatus(createStatus(server.id, 'connected', 'ready'));

    return { ok: true, serverId: server.id, cache };
  } catch (error) {
    const localError = classifyMcpLocalError(error);
    closeSession(server.id);
    setStatus(createStatus(server.id, 'failed', 'failed', localError.message));

    return {
      ok: false,
      serverId: server.id,
      errorCode: localError.code,
      message: localError.message
    };
  }
}

/**
 * 刷新指定 MCP server 的 discovery cache。
 * @param server - MCP server 配置
 * @param dependencies - 可注入依赖
 * @returns discovery 刷新结果
 */
export async function refreshMcpDiscovery(server: MCPServerConfig, dependencies: MCPDiscoveryRefreshDependencies = {}): Promise<MCPDiscoveryRefreshResult> {
  if (dependencies.discoverTools && !dependencies.createSession) {
    setStatus(createStatus(server.id, 'connecting', 'refreshing'));

    try {
      const cache: MCPServerDiscoveryCache = {
        serverId: server.id,
        tools: await dependencies.discoverTools(server),
        discoveredAt: dependencies.now?.() ?? Date.now()
      };

      discoveryCacheByServerId.set(server.id, cache);
      setStatus(createStatus(server.id, 'connected', 'ready'));

      return { ok: true, serverId: server.id, cache };
    } catch (error) {
      const localError = classifyMcpLocalError(error);
      setStatus(createStatus(server.id, 'failed', 'failed', localError.message));

      return {
        ok: false,
        serverId: server.id,
        errorCode: localError.code,
        message: localError.message
      };
    }
  }

  return connectMcpServer(server, dependencies);
}

/**
 * 断开指定 MCP server session。
 * @param serverId - server ID
 */
export function disconnectMcpServer(serverId: string): void {
  closeSession(serverId);
  setStatus(createStatus(serverId, 'idle', 'idle'));
}

/**
 * 重启指定 MCP server session 并刷新 discovery cache。
 * @param server - MCP server 配置
 * @param dependencies - 可注入依赖
 * @returns discovery 刷新结果
 */
export async function restartMcpServer(server: MCPServerConfig, dependencies: MCPDiscoveryRefreshDependencies = {}): Promise<MCPDiscoveryRefreshResult> {
  closeSession(server.id);
  return connectMcpServer(server, dependencies);
}

/**
 * 在本机执行指定 MCP tool。
 * @param server - MCP server 配置
 * @param toolName - MCP tool 名称
 * @param input - Tool 输入
 * @param dependencies - 可注入依赖
 * @returns MCP tool 调用结果
 */
export async function executeMcpTool(
  server: MCPServerConfig,
  toolName: string,
  input: unknown,
  dependencies: MCPToolExecutionDependencies = {}
): Promise<unknown> {
  if (dependencies.executeTool && !dependencies.createSession && !sessionsByServerId.has(server.id)) {
    return dependencies.executeTool(server, toolName, input);
  }

  if (sessionsByServerId.has(server.id) && sessionSignatureByServerId.get(server.id) !== createServerSessionSignature(server)) {
    closeSession(server.id);
  }

  let session = sessionsByServerId.get(server.id);
  if (!session) {
    const result = await connectMcpServer(server, {
      spawnProcess: dependencies.spawnProcess,
      createSession: dependencies.createSession,
      now: dependencies.now
    });
    if (!result.ok) {
      throw new Error(result.message ?? `MCP server failed to connect: ${server.id}`);
    }
    session = sessionsByServerId.get(server.id);
  }

  if (session) {
    try {
      return await session.callTool(toolName, input);
    } catch (error) {
      const localError = classifyMcpLocalError(error);
      closeSession(server.id);
      setStatus(createStatus(server.id, 'failed', 'failed', localError.message));
      throw error;
    }
  }

  return executeMcpToolWithLocalRunner(server, toolName, input, dependencies.spawnProcess);
}
