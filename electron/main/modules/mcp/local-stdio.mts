/**
 * @file local-stdio.mts
 * @description 在本机通过受控 stdio 子进程执行 MCP server discovery 与 tool 调用。
 */
import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from 'node:child_process';
import type { MCPDiscoveredToolSnapshot, MCPServerConfig } from 'types/ai';

/**
 * 本地 MCP 子进程创建函数。
 */
export type MCPLocalSpawn = (command: string, args: string[], options: SpawnOptionsWithoutStdio) => ChildProcessWithoutNullStreams;

/**
 * 可复用的本地 MCP stdio 会话。
 */
export interface MCPLocalSession {
  /**
   * 获取 MCP tools/list 全量结果。
   * @returns discovery 工具快照
   */
  listTools(): Promise<MCPDiscoveredToolSnapshot[]>;
  /**
   * 调用 MCP tool。
   * @param toolName - MCP tool 名称
   * @param input - Tool 输入
   * @returns MCP tool 调用结果
   */
  callTool(toolName: string, input: unknown): Promise<unknown>;
  /**
   * 关闭 MCP 子进程。
   */
  close(): void;
}

/**
 * 待完成 JSON-RPC 请求。
 */
interface PendingRpcRequest {
  /** 成功回调 */
  resolve: (value: unknown) => void;
  /** 失败回调 */
  reject: (error: Error) => void;
  /** 请求超时句柄 */
  timeout: NodeJS.Timeout;
}

/**
 * JSON-RPC 响应对象。
 */
interface JsonRpcResponse {
  /** JSON-RPC ID */
  id?: string | number;
  /** 响应结果 */
  result?: unknown;
  /** 响应错误 */
  error?: {
    /** 错误信息 */
    message?: string;
  };
}

/**
 * 判断未知值是否为普通对象。
 * @param value - 未知值
 * @returns 是否为对象记录
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 确保 server 命令可由本地 runner 执行。
 * @param server - MCP server 配置
 */
function assertRunnableServer(server: MCPServerConfig): void {
  if (!server.enabled) {
    throw new Error(`MCP server is disabled: ${server.id}`);
  }
  if (!server.command.trim()) {
    throw new Error(`MCP server command is empty: ${server.id}`);
  }
  if (/[\0\r\n]/u.test(server.command)) {
    throw new Error(`MCP server command contains invalid characters: ${server.id}`);
  }
}

/**
 * 将 MCP 工具输入收敛为对象。
 * @param input - 原始输入
 * @returns MCP tools/call arguments
 */
function normalizeToolInput(input: unknown): Record<string, unknown> {
  return isRecord(input) ? input : {};
}

/**
 * 从 tools/list 响应提取下一页 cursor。
 * @param result - JSON-RPC result
 * @returns 下一页 cursor
 */
function getNextCursor(result: unknown): string | undefined {
  if (!isRecord(result)) return undefined;
  return typeof result.nextCursor === 'string' ? result.nextCursor : undefined;
}

/**
 * 从 tools/list 响应提取工具数组。
 * @param result - JSON-RPC result
 * @returns MCP tool 数组
 */
function getToolEntries(result: unknown): Record<string, unknown>[] {
  if (!isRecord(result) || !Array.isArray(result.tools)) return [];
  return result.tools.filter((tool): tool is Record<string, unknown> => isRecord(tool));
}

/**
 * 将 MCP tool 元数据转换为 discovery snapshot。
 * @param serverId - MCP server ID
 * @param tool - MCP tool 元数据
 * @returns discovery snapshot 或 null
 */
function toToolSnapshot(serverId: string, tool: Record<string, unknown>): MCPDiscoveredToolSnapshot | null {
  if (typeof tool.name !== 'string' || tool.name.trim().length === 0) return null;
  return {
    serverId,
    toolName: tool.name,
    description: typeof tool.description === 'string' ? tool.description : undefined,
    inputSchema: isRecord(tool.inputSchema) ? tool.inputSchema : undefined
  };
}

/**
 * 本地 MCP stdio 会话。
 */
class LocalMcpStdioSession implements MCPLocalSession {
  private readonly child: ChildProcessWithoutNullStreams;

  private readonly pending = new Map<string | number, PendingRpcRequest>();

  private stdoutBuffer = '';

  private nextId = 1;

  private stderrBuffer = '';

  /**
   * 创建本地 stdio 会话。
   * @param server - MCP server 配置
   * @param spawnProcess - 子进程创建函数
   */
  constructor(private readonly server: MCPServerConfig, spawnProcess: MCPLocalSpawn) {
    assertRunnableServer(server);
    this.child = spawnProcess(server.command, server.args, {
      env: { ...process.env, ...server.env },
      shell: false
    });
    this.child.stdout.on('data', (chunk: Buffer) => this.handleStdout(chunk));
    this.child.stderr.on('data', (chunk: Buffer) => {
      this.stderrBuffer += chunk.toString('utf8');
    });
    this.child.on('error', (error: Error) => this.rejectAll(error));
    this.child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      if (this.pending.size === 0) return;
      this.rejectAll(new Error(`MCP server exited before responding: code=${code ?? 'null'} signal=${signal ?? 'null'} ${this.stderrBuffer.trim()}`.trim()));
    });
  }

  /**
   * 处理 stdout chunk。
   * @param chunk - stdout chunk
   */
  private handleStdout(chunk: Buffer): void {
    this.stdoutBuffer += chunk.toString('utf8');
    let index = this.stdoutBuffer.indexOf('\n');
    while (index >= 0) {
      const line = this.stdoutBuffer.slice(0, index).replace(/\r$/u, '');
      this.stdoutBuffer = this.stdoutBuffer.slice(index + 1);
      this.handleLine(line);
      index = this.stdoutBuffer.indexOf('\n');
    }
  }

  /**
   * 处理单行 JSON-RPC 响应。
   * @param line - stdout 行
   */
  private handleLine(line: string): void {
    if (!line.trim()) return;
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (!isRecord(message) || (typeof message.id !== 'string' && typeof message.id !== 'number')) return;
    const response = message as JsonRpcResponse;
    const responseId = response.id;
    if (typeof responseId === 'undefined') return;
    const pending = this.pending.get(responseId);
    if (!pending) return;

    this.pending.delete(responseId);
    clearTimeout(pending.timeout);
    if (response.error) {
      pending.reject(new Error(response.error.message ?? JSON.stringify(response.error)));
      return;
    }
    pending.resolve(response.result);
  }

  /**
   * 拒绝全部待完成请求。
   * @param error - 失败原因
   */
  private rejectAll(error: Error): void {
    for (const [id, pending] of this.pending.entries()) {
      this.pending.delete(id);
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
  }

  /**
   * 发送 JSON-RPC 请求。
   * @param method - MCP 方法
   * @param params - MCP 参数
   * @param timeoutMs - 超时时间
   * @returns JSON-RPC result
   */
  private request(method: string, params: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    const id = this.nextId;
    this.nextId += 1;

    const promise = new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
    });

    this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    return promise;
  }

  /**
   * 发送 JSON-RPC notification。
   * @param method - MCP 方法
   * @param params - MCP 参数
   */
  private notify(method: string, params: Record<string, unknown>): void {
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  }

  /**
   * 初始化 MCP 会话。
   */
  async initialize(): Promise<void> {
    await this.request(
      'initialize',
      {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'tibis', version: '0.1.0' }
      },
      this.server.connectTimeoutMs
    );
    this.notify('notifications/initialized', {});
  }

  /**
   * 获取 MCP tools/list 全量结果。
   * @returns discovery 工具快照
   */
  async listTools(): Promise<MCPDiscoveredToolSnapshot[]> {
    const tools: MCPDiscoveredToolSnapshot[] = [];
    let cursor: string | undefined;
    do {
      // MCP pagination is cursor-dependent, so requests must run sequentially.
      // eslint-disable-next-line no-await-in-loop
      const result = await this.request('tools/list', cursor ? { cursor } : {}, this.server.toolCallTimeoutMs);
      for (const tool of getToolEntries(result)) {
        const snapshot = toToolSnapshot(this.server.id, tool);
        if (snapshot) tools.push(snapshot);
      }
      cursor = getNextCursor(result);
    } while (cursor);
    return tools;
  }

  /**
   * 调用 MCP tool。
   * @param toolName - MCP tool 名称
   * @param input - Tool 输入
   * @returns MCP tool 调用结果
   */
  async callTool(toolName: string, input: unknown): Promise<unknown> {
    return this.request(
      'tools/call',
      {
        name: toolName,
        arguments: normalizeToolInput(input)
      },
      this.server.toolCallTimeoutMs
    );
  }

  /**
   * 关闭 MCP 子进程。
   */
  close(): void {
    this.child.stdin.end();
    if (!this.child.killed) {
      this.child.kill();
    }
  }
}

/**
 * 创建并初始化可复用的本地 MCP stdio 会话。
 * @param server - MCP server 配置
 * @param spawnProcess - 可注入 spawn 函数
 * @returns 已完成 initialize 的 MCP stdio 会话
 */
export async function createMcpStdioSession(server: MCPServerConfig, spawnProcess: MCPLocalSpawn = spawn): Promise<MCPLocalSession> {
  const session = new LocalMcpStdioSession(server, spawnProcess);
  try {
    await session.initialize();
    return session;
  } catch (error) {
    session.close();
    throw error;
  }
}

/**
 * 在本机 discovery MCP tools。
 * @param server - MCP server 配置
 * @param spawnProcess - 可注入 spawn 函数
 * @returns discovery 工具快照
 */
export async function discoverMcpToolsLocally(server: MCPServerConfig, spawnProcess: MCPLocalSpawn = spawn): Promise<MCPDiscoveredToolSnapshot[]> {
  const session = await createMcpStdioSession(server, spawnProcess);
  try {
    return await session.listTools();
  } finally {
    session.close();
  }
}

/**
 * 在本机执行 MCP tool。
 * @param server - MCP server 配置
 * @param toolName - MCP tool 名称
 * @param input - Tool 输入
 * @param spawnProcess - 可注入 spawn 函数
 * @returns MCP tool 调用结果
 */
export async function executeMcpToolLocally(server: MCPServerConfig, toolName: string, input: unknown, spawnProcess: MCPLocalSpawn = spawn): Promise<unknown> {
  const session = await createMcpStdioSession(server, spawnProcess);
  try {
    return await session.callTool(toolName, input);
  } finally {
    session.close();
  }
}
