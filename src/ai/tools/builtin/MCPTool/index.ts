/**
 * @file MCPTool/index.ts
 * @description 内置 MCP 工具实现，管理 MCP 服务器配置与发现。
 */
import type { AIToolConfirmationAdapter, AIToolConfirmationRequest } from '../../confirmation';
import type { AIToolExecutor, MCPDiscoveryRefreshResult } from 'types/ai';
import { nanoid } from 'nanoid';
import { getElectronAPI, hasElectronAPI } from '@/shared/platform/electron-api';
import type { MCPServerConfig, MCPToolSettings } from '@/shared/storage/tool-settings';
import {
  DEFAULT_MCP_CONNECT_TIMEOUT_MS,
  DEFAULT_MCP_TOOL_CALL_TIMEOUT_MS,
  MAX_CONNECT_TIMEOUT_MS,
  MAX_TOOL_CALL_TIMEOUT_MS,
  MIN_CONNECT_TIMEOUT_MS,
  MIN_TOOL_CALL_TIMEOUT_MS
} from '@/shared/storage/tool-settings';
import { useToolSettingsStore } from '@/stores/ai/toolSettings';
import { executeWithPermission } from '../../permission';
import { createToolFailureResult, createToolSuccessResult } from '../../results';

/** MCP 配置读取工具名称。 */
export const GET_MCP_SETTINGS_TOOL_NAME = 'get_mcp_settings';

/** MCP server 新增工具名称。 */
export const ADD_MCP_SERVER_TOOL_NAME = 'add_mcp_server';

/** MCP server 更新工具名称。 */
export const UPDATE_MCP_SERVER_TOOL_NAME = 'update_mcp_server';

/** MCP server 删除工具名称。 */
export const REMOVE_MCP_SERVER_TOOL_NAME = 'remove_mcp_server';

/** MCP discovery 刷新工具名称。 */
export const REFRESH_MCP_DISCOVERY_TOOL_NAME = 'refresh_mcp_discovery';

/**
 * 新增 MCP server 输入。
 */
export interface AddMcpServerInput {
  /** 展示名称。 */
  name?: string;
  /** 是否启用。 */
  enabled?: boolean;
  /** 本地启动命令。 */
  command: string;
  /** 启动参数。 */
  args?: string[];
  /** 环境变量。 */
  env?: Record<string, string>;
  /** 默认允许暴露的工具名。 */
  toolAllowlist?: string[];
  /** 连接超时。 */
  connectTimeoutMs?: number;
  /** 工具调用超时。 */
  toolCallTimeoutMs?: number;
}

/**
 * 可更新的 MCP server 字段。
 */
export interface UpdateMcpServerPatchInput {
  /** 展示名称。 */
  name?: string;
  /** 是否启用。 */
  enabled?: boolean;
  /** 本地启动命令。 */
  command?: string;
  /** 启动参数。 */
  args?: string[];
  /** 环境变量。 */
  env?: Record<string, string>;
  /** 默认允许暴露的工具名。 */
  toolAllowlist?: string[];
  /** 连接超时。 */
  connectTimeoutMs?: number;
  /** 工具调用超时。 */
  toolCallTimeoutMs?: number;
}

/**
 * 更新 MCP server 输入。
 */
export interface UpdateMcpServerInput {
  /** MCP server ID。 */
  serverId: string;
  /** 待更新字段。 */
  patch: UpdateMcpServerPatchInput;
}

/**
 * 删除 MCP server 输入。
 */
export interface RemoveMcpServerInput {
  /** MCP server ID。 */
  serverId: string;
}

/**
 * 刷新 MCP discovery 输入。
 */
export interface RefreshMcpDiscoveryInput {
  /** MCP server ID。 */
  serverId: string;
}

/**
 * 获取 MCP 设置结果。
 */
export interface GetMcpSettingsResult {
  /** 当前 MCP 设置。 */
  settings: MCPToolSettings;
}

/**
 * 新增 MCP server 结果。
 */
export interface AddMcpServerResult {
  /** 是否已应用。 */
  applied: true;
  /** 新增后的 server。 */
  server: MCPServerConfig;
}

/**
 * 更新 MCP server 结果。
 */
export interface UpdateMcpServerResult {
  /** 是否已应用。 */
  applied: true;
  /** 更新前的 server。 */
  previousServer: MCPServerConfig;
  /** 更新后的 server。 */
  currentServer: MCPServerConfig;
}

/**
 * 删除 MCP server 结果。
 */
export interface RemoveMcpServerResult {
  /** 是否已应用。 */
  applied: true;
  /** 被删除的 server。 */
  removedServer: MCPServerConfig;
}

/**
 * 刷新 MCP discovery 结果。
 */
export interface RefreshMcpDiscoveryResult {
  /** 是否已触发刷新。 */
  refreshed: true;
  /** 主进程返回的刷新结果。 */
  result: MCPDiscoveryRefreshResult;
}

/**
 * 内置 MCP 配置工具集合。
 */
export interface BuiltinMCPTools {
  /** 获取 MCP 设置工具。 */
  getMcpSettings: AIToolExecutor<Record<string, never>, GetMcpSettingsResult>;
  /** 新增 MCP server 工具。 */
  addMcpServer: AIToolExecutor<AddMcpServerInput, AddMcpServerResult>;
  /** 更新 MCP server 工具。 */
  updateMcpServer: AIToolExecutor<UpdateMcpServerInput, UpdateMcpServerResult>;
  /** 删除 MCP server 工具。 */
  removeMcpServer: AIToolExecutor<RemoveMcpServerInput, RemoveMcpServerResult>;
  /** 刷新 MCP discovery 工具。 */
  refreshMcpDiscovery: AIToolExecutor<RefreshMcpDiscoveryInput, RefreshMcpDiscoveryResult>;
}

/**
 * 判断值是否为普通对象。
 * @param value - 待检查值
 * @returns 是否为普通对象
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 归一化字符串数组。
 * @param value - 原始值
 * @returns 仅包含有效字符串的数组
 */
function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item: unknown): item is string => typeof item === 'string')
    .map((item: string) => item.trim())
    .filter(Boolean);
}

/**
 * 归一化环境变量字典。
 * @param value - 原始值
 * @returns 字符串环境变量字典
 */
function normalizeEnv(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  const env: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key.trim().length > 0 && typeof item === 'string') {
      env[key] = item;
    }
  }
  return env;
}

/**
 * 归一化超时字段。
 * @param value - 原始值
 * @param defaultValue - 默认值
 * @param minValue - 最小值
 * @param maxValue - 最大值
 * @returns 合法超时值
 */
function normalizeTimeout(value: unknown, defaultValue: number, minValue: number, maxValue: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return defaultValue;
  }
  return Math.min(maxValue, Math.max(minValue, Math.round(value)));
}

/**
 * 获取 server，不存在时返回错误消息。
 * @param serverId - MCP server ID
 * @returns server 或错误消息
 */
function getExistingServer(serverId: string): MCPServerConfig | string {
  const toolSettingsStore = useToolSettingsStore();
  const server = toolSettingsStore.getMcpServerById(serverId);

  return server ?? '找不到指定的 MCP server。';
}

/**
 * 复制当前 MCP 设置，避免调用方误改 store 内部引用。
 * @returns MCP 设置快照
 */
function snapshotMcpSettings(): MCPToolSettings {
  const toolSettingsStore = useToolSettingsStore();

  return {
    servers: toolSettingsStore.mcp.servers.map((server) => ({
      ...server,
      args: [...server.args],
      env: { ...server.env },
      headers: { ...server.headers },
      toolAllowlist: [...server.toolAllowlist]
    }))
  };
}

/**
 * 创建新增 server 配置。
 * @param input - 工具输入
 * @returns server 配置或错误消息
 */
function createServerFromInput(input: AddMcpServerInput): MCPServerConfig | string {
  if (typeof input.command !== 'string' || input.command.trim().length === 0) {
    return 'command 不能为空。';
  }

  const command = input.command.trim();
  return {
    id: nanoid(),
    name: typeof input.name === 'string' && input.name.trim().length > 0 ? input.name.trim() : command,
    enabled: input.enabled ?? true,
    transport: 'stdio',
    command,
    args: normalizeStringArray(input.args),
    env: normalizeEnv(input.env),
    headers: {},
    toolAllowlist: normalizeStringArray(input.toolAllowlist),
    connectTimeoutMs: normalizeTimeout(input.connectTimeoutMs, DEFAULT_MCP_CONNECT_TIMEOUT_MS, MIN_CONNECT_TIMEOUT_MS, MAX_CONNECT_TIMEOUT_MS),
    toolCallTimeoutMs: normalizeTimeout(input.toolCallTimeoutMs, DEFAULT_MCP_TOOL_CALL_TIMEOUT_MS, MIN_TOOL_CALL_TIMEOUT_MS, MAX_TOOL_CALL_TIMEOUT_MS)
  };
}

/**
 * 创建更新补丁。
 * @param patch - 工具输入补丁
 * @returns MCP server 补丁
 */
function createServerPatch(patch: UpdateMcpServerPatchInput): Partial<MCPServerConfig> {
  const normalizedPatch: Partial<MCPServerConfig> = {};

  if (typeof patch.name === 'string') {
    normalizedPatch.name = patch.name.trim();
  }
  if (typeof patch.enabled === 'boolean') {
    normalizedPatch.enabled = patch.enabled;
  }
  if (typeof patch.command === 'string') {
    normalizedPatch.command = patch.command.trim();
  }
  if (Array.isArray(patch.args)) {
    normalizedPatch.args = normalizeStringArray(patch.args);
  }
  if (patch.env !== undefined) {
    normalizedPatch.env = normalizeEnv(patch.env);
  }
  if (Array.isArray(patch.toolAllowlist)) {
    normalizedPatch.toolAllowlist = normalizeStringArray(patch.toolAllowlist);
  }
  if (patch.connectTimeoutMs !== undefined) {
    normalizedPatch.connectTimeoutMs = normalizeTimeout(patch.connectTimeoutMs, DEFAULT_MCP_CONNECT_TIMEOUT_MS, MIN_CONNECT_TIMEOUT_MS, MAX_CONNECT_TIMEOUT_MS);
  }
  if (patch.toolCallTimeoutMs !== undefined) {
    normalizedPatch.toolCallTimeoutMs = normalizeTimeout(
      patch.toolCallTimeoutMs,
      DEFAULT_MCP_TOOL_CALL_TIMEOUT_MS,
      MIN_TOOL_CALL_TIMEOUT_MS,
      MAX_TOOL_CALL_TIMEOUT_MS
    );
  }

  return normalizedPatch;
}

/**
 * 格式化确认对比内容。
 * @param value - 待展示值
 * @returns JSON 字符串
 */
function formatConfirmationValue(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/**
 * 创建 MCP 配置写操作确认请求。
 * @param toolName - 工具名称
 * @param title - 确认标题
 * @param description - 确认描述
 * @param beforeText - 执行前文本
 * @param afterText - 执行后文本
 * @returns 确认请求
 */
function createMcpWriteConfirmationRequest(
  toolName: string,
  title: string,
  description: string,
  beforeText: string,
  afterText: string
): AIToolConfirmationRequest {
  return {
    toolName,
    title,
    description,
    riskLevel: 'write',
    allowRemember: false,
    beforeText,
    afterText
  };
}

/**
 * MCP 工具 store 接口，仅声明 MCPTool 条件注册所需的方法。
 */
export interface MCPStoreLike {
  /** 是否存在已启用且配置完整的 MCP server */
  hasEnabledMcpServers: boolean;
}

/**
 * 判断是否存在已配置的 MCP server。
 * @param store - MCP store 实例
 * @returns 是否有可用的 MCP server 配置
 */
export function hasMcpServers(store: MCPStoreLike): boolean {
  return store.hasEnabledMcpServers;
}

/**
 * 创建内置 MCP 工具。
 * @param adapter - 确认适配器
 * @returns MCP 工具集合
 */
export function createBuiltinMCPTools(adapter: AIToolConfirmationAdapter): BuiltinMCPTools {
  return {
    getMcpSettings: {
      definition: {
        name: GET_MCP_SETTINGS_TOOL_NAME,
        description: '获取当前 MCP 配置，包括本地 stdio server、命令、参数、环境变量、allowlist 与超时设置。',
        source: 'builtin',
        riskLevel: 'read',
        permissionCategory: 'settings',
        safeAutoApprove: true,
        requiresActiveDocument: false,
        parameters: {
          type: 'object',
          properties: {},
          additionalProperties: false
        }
      },
      async execute() {
        return createToolSuccessResult(GET_MCP_SETTINGS_TOOL_NAME, { settings: snapshotMcpSettings() });
      }
    },
    addMcpServer: {
      definition: {
        name: ADD_MCP_SERVER_TOOL_NAME,
        description: '新增一个本地 stdio MCP server 配置。该工具只写入配置，不会立即执行 server。',
        source: 'builtin',
        riskLevel: 'write',
        permissionCategory: 'settings',
        safeAutoApprove: false,
        requiresActiveDocument: false,
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '展示名称。' },
            enabled: { type: 'boolean', description: '是否启用，默认 true。' },
            command: { type: 'string', description: '本地启动命令，例如 npx、node、python。' },
            args: { type: 'array', items: { type: 'string' }, description: '启动参数。' },
            env: { type: 'object', additionalProperties: { type: 'string' }, description: '环境变量字典。' },
            toolAllowlist: { type: 'array', items: { type: 'string' }, description: '允许暴露的 MCP tool 名称，空数组表示不额外限制。' },
            connectTimeoutMs: { type: 'number', description: '连接与握手超时，单位毫秒。' },
            toolCallTimeoutMs: { type: 'number', description: '工具调用超时，单位毫秒。' }
          },
          required: ['command'],
          additionalProperties: false
        }
      },
      async execute(input: AddMcpServerInput) {
        const server = createServerFromInput(input);
        if (typeof server === 'string') {
          return createToolFailureResult(ADD_MCP_SERVER_TOOL_NAME, 'INVALID_INPUT', server);
        }

        const request = createMcpWriteConfirmationRequest(
          ADD_MCP_SERVER_TOOL_NAME,
          'AI 想要新增 MCP server',
          `AI 请求新增 MCP server：${server.name}。`,
          '新增前不会修改现有 MCP server。',
          formatConfirmationValue(server)
        );

        return executeWithPermission({
          definition: this.definition,
          adapter,
          request,
          operation: async () => {
            const toolSettingsStore = useToolSettingsStore();
            await toolSettingsStore.addMcpServer(server);
            const savedServer = toolSettingsStore.getMcpServerById(server.id) ?? server;

            return { applied: true, server: savedServer };
          }
        });
      }
    },
    updateMcpServer: {
      definition: {
        name: UPDATE_MCP_SERVER_TOOL_NAME,
        description: '更新一个本地 stdio MCP server 配置。',
        source: 'builtin',
        riskLevel: 'write',
        permissionCategory: 'settings',
        safeAutoApprove: false,
        requiresActiveDocument: false,
        parameters: {
          type: 'object',
          properties: {
            serverId: { type: 'string', description: 'MCP server ID。' },
            patch: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                enabled: { type: 'boolean' },
                command: { type: 'string' },
                args: { type: 'array', items: { type: 'string' } },
                env: { type: 'object', additionalProperties: { type: 'string' } },
                toolAllowlist: { type: 'array', items: { type: 'string' } },
                connectTimeoutMs: { type: 'number' },
                toolCallTimeoutMs: { type: 'number' }
              },
              additionalProperties: false
            }
          },
          required: ['serverId', 'patch'],
          additionalProperties: false
        }
      },
      async execute(input: UpdateMcpServerInput) {
        const existingServer = getExistingServer(input.serverId);
        if (typeof existingServer === 'string') {
          return createToolFailureResult(UPDATE_MCP_SERVER_TOOL_NAME, 'INVALID_INPUT', existingServer);
        }

        const patch = createServerPatch(input.patch);
        const nextServer = { ...existingServer, ...patch, id: existingServer.id, transport: 'stdio' as const };
        const request = createMcpWriteConfirmationRequest(
          UPDATE_MCP_SERVER_TOOL_NAME,
          'AI 想要更新 MCP server',
          `AI 请求更新 MCP server：${existingServer.name}。`,
          formatConfirmationValue(existingServer),
          formatConfirmationValue(nextServer)
        );

        return executeWithPermission({
          definition: this.definition,
          adapter,
          request,
          operation: async () => {
            const toolSettingsStore = useToolSettingsStore();
            await toolSettingsStore.updateMcpServer(existingServer.id, patch);
            const currentServer = toolSettingsStore.getMcpServerById(existingServer.id) ?? nextServer;

            return { applied: true, previousServer: existingServer, currentServer };
          }
        });
      }
    },
    removeMcpServer: {
      definition: {
        name: REMOVE_MCP_SERVER_TOOL_NAME,
        description: '删除一个本地 MCP server 配置。',
        source: 'builtin',
        riskLevel: 'write',
        permissionCategory: 'settings',
        safeAutoApprove: false,
        requiresActiveDocument: false,
        parameters: {
          type: 'object',
          properties: {
            serverId: { type: 'string', description: 'MCP server ID。' }
          },
          required: ['serverId'],
          additionalProperties: false
        }
      },
      async execute(input: RemoveMcpServerInput) {
        const existingServer = getExistingServer(input.serverId);
        if (typeof existingServer === 'string') {
          return createToolFailureResult(REMOVE_MCP_SERVER_TOOL_NAME, 'INVALID_INPUT', existingServer);
        }

        const request = createMcpWriteConfirmationRequest(
          REMOVE_MCP_SERVER_TOOL_NAME,
          'AI 想要删除 MCP server',
          `AI 请求删除 MCP server：${existingServer.name}。`,
          formatConfirmationValue(existingServer),
          '删除后该 MCP server 不会再出现在配置中。'
        );

        return executeWithPermission({
          definition: this.definition,
          adapter,
          request,
          operation: async () => {
            const toolSettingsStore = useToolSettingsStore();
            await toolSettingsStore.removeMcpServer(existingServer.id);

            return { applied: true, removedServer: existingServer };
          }
        });
      }
    },
    refreshMcpDiscovery: {
      definition: {
        name: REFRESH_MCP_DISCOVERY_TOOL_NAME,
        description: '刷新指定 MCP server 的工具发现缓存。该操作会在本地启动配置的 stdio MCP server 并执行 tools/list。',
        source: 'builtin',
        riskLevel: 'write',
        permissionCategory: 'settings',
        safeAutoApprove: false,
        requiresActiveDocument: false,
        parameters: {
          type: 'object',
          properties: {
            serverId: { type: 'string', description: 'MCP server ID。' }
          },
          required: ['serverId'],
          additionalProperties: false
        }
      },
      async execute(input: RefreshMcpDiscoveryInput) {
        const existingServer = getExistingServer(input.serverId);
        if (typeof existingServer === 'string') {
          return createToolFailureResult(REFRESH_MCP_DISCOVERY_TOOL_NAME, 'INVALID_INPUT', existingServer);
        }
        if (!hasElectronAPI()) {
          return createToolFailureResult(REFRESH_MCP_DISCOVERY_TOOL_NAME, 'EXECUTION_FAILED', '当前环境不支持刷新 MCP discovery。');
        }

        const request = createMcpWriteConfirmationRequest(
          REFRESH_MCP_DISCOVERY_TOOL_NAME,
          'AI 想要刷新 MCP discovery',
          `AI 请求启动本地 MCP server 并刷新工具列表：${existingServer.name}。`,
          '刷新前不会修改 MCP 配置。',
          formatConfirmationValue(existingServer)
        );

        return executeWithPermission({
          definition: this.definition,
          adapter,
          request,
          operation: async () => {
            const plainServer: MCPServerConfig = {
              ...existingServer,
              args: [...existingServer.args],
              env: { ...existingServer.env },
              headers: { ...existingServer.headers },
              toolAllowlist: [...existingServer.toolAllowlist],
              oauth: existingServer.oauth ? { ...existingServer.oauth } : undefined
            };
            const result = await getElectronAPI().refreshMcpDiscovery(plainServer);

            return { refreshed: true, result };
          }
        });
      }
    }
  };
}
