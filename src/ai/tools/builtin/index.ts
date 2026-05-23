/**
 * @file builtin/index.ts
 * @description 内置工具工厂函数，内置工具名称清单与默认暴露策略
 */
import type { BuiltinToolBaseOptions } from '../shared/types';
import type { AIToolExecutor } from 'types/ai';
import { nanoid } from 'nanoid';
import { ASK_USER_QUESTION_TOOL_NAME, createAskUserQuestionTool, type PendingQuestionSnapshot } from './AskUserQuestionTool';
import { READ_CURRENT_DOCUMENT_TOOL_NAME, createBuiltinReadTools } from './DocumentTool';
import { GET_CURRENT_TIME_TOOL_NAME, createBuiltinEnvironmentTools } from './EnvironmentTool';
import { EDIT_FILE_TOOL_NAME, createBuiltinEditFileTool } from './FileEditTool';
import { createBuiltinReadDirectoryTool, createBuiltinReadFileTool, READ_DIRECTORY_TOOL_NAME, READ_FILE_TOOL_NAME } from './FileReadTool';
import { createBuiltinWriteFileTool, WRITE_FILE_TOOL_NAME } from './FileWriteTool';
import { createBuiltinLogTools, QUERY_LOGS_TOOL_NAME } from './LogsTool';
import {
  ADD_MCP_SERVER_TOOL_NAME,
  createBuiltinMCPSettingsTools,
  GET_MCP_SETTINGS_TOOL_NAME,
  REFRESH_MCP_DISCOVERY_TOOL_NAME,
  REMOVE_MCP_SERVER_TOOL_NAME,
  UPDATE_MCP_SERVER_TOOL_NAME
} from './MCPSettingsTool';
import { createBuiltinSettingsTools, GET_SETTINGS_TOOL_NAME, UPDATE_SETTINGS_TOOL_NAME } from './SettingsTool';
import { createSkillTool, SKILL_TOOL_NAME, type SkillStoreLike } from './SkillTool';

// 重新导出工具名称
export { ASK_USER_QUESTION_TOOL_NAME } from './AskUserQuestionTool';
export { READ_CURRENT_DOCUMENT_TOOL_NAME } from './DocumentTool';
export { GET_CURRENT_TIME_TOOL_NAME } from './EnvironmentTool';
export { EDIT_FILE_TOOL_NAME } from './FileEditTool';
export { READ_DIRECTORY_TOOL_NAME, READ_FILE_TOOL_NAME } from './FileReadTool';
export { WRITE_FILE_TOOL_NAME } from './FileWriteTool';
export { QUERY_LOGS_TOOL_NAME } from './LogsTool';
export {
  ADD_MCP_SERVER_TOOL_NAME,
  GET_MCP_SETTINGS_TOOL_NAME,
  REFRESH_MCP_DISCOVERY_TOOL_NAME,
  REMOVE_MCP_SERVER_TOOL_NAME,
  UPDATE_MCP_SERVER_TOOL_NAME
} from './MCPSettingsTool';
export { GET_SETTINGS_TOOL_NAME, UPDATE_SETTINGS_TOOL_NAME } from './SettingsTool';
export { SKILL_TOOL_NAME } from './SkillTool';

/**
 * 由主进程 AI SDK 直接执行的远端工具名称。
 * 这些工具会出现在流式 tool-call 中，但不会由渲染进程本地 executor 执行。
 */
export const SDK_MANAGED_TOOL_NAMES = ['tavily_search', 'tavily_extract'] as const;

/**
 * 判断工具名称是否由主进程 AI SDK 直接托管执行。
 * @param toolName - 工具名称
 * @returns 是否为 SDK 托管工具
 */
export function isSdkManagedToolName(toolName: string): boolean {
  return SDK_MANAGED_TOOL_NAMES.includes(toolName as (typeof SDK_MANAGED_TOOL_NAMES)[number]);
}

/**
 * 默认开放的只读内置工具名称列表。
 */
export const DEFAULT_BUILTIN_READONLY_TOOL_NAMES = [
  READ_CURRENT_DOCUMENT_TOOL_NAME,
  GET_CURRENT_TIME_TOOL_NAME,
  ASK_USER_QUESTION_TOOL_NAME,
  READ_FILE_TOOL_NAME,
  READ_DIRECTORY_TOOL_NAME,
  GET_SETTINGS_TOOL_NAME,
  GET_MCP_SETTINGS_TOOL_NAME,
  QUERY_LOGS_TOOL_NAME,
  SKILL_TOOL_NAME
] as const;

/**
 * 默认开放的内置写工具名称列表。
 */
export const DEFAULT_BUILTIN_WRITABLE_TOOL_NAMES = [
  EDIT_FILE_TOOL_NAME,
  WRITE_FILE_TOOL_NAME,
  UPDATE_SETTINGS_TOOL_NAME,
  ADD_MCP_SERVER_TOOL_NAME,
  UPDATE_MCP_SERVER_TOOL_NAME,
  REMOVE_MCP_SERVER_TOOL_NAME,
  REFRESH_MCP_DISCOVERY_TOOL_NAME
] as const;

/**
 * 获取默认聊天工具名称列表。
 * @returns 默认聊天工具名称数组
 */
export function getDefaultBuiltinChatToolNames(): string[] {
  return [...DEFAULT_BUILTIN_READONLY_TOOL_NAMES, ...DEFAULT_BUILTIN_WRITABLE_TOOL_NAMES];
}

/**
 * 判断工具名称是否属于默认只读工具。
 * @param toolName - 工具名称
 * @returns 是否为默认只读工具
 */
export function isDefaultBuiltinReadonlyToolName(toolName: string): boolean {
  return DEFAULT_BUILTIN_READONLY_TOOL_NAMES.includes(toolName as (typeof DEFAULT_BUILTIN_READONLY_TOOL_NAMES)[number]);
}

/**
 * 判断工具名称是否属于默认低风险写工具。
 * @param toolName - 工具名称
 * @returns 是否为默认低风险写工具
 */
export function isDefaultBuiltinWritableToolName(toolName: string): boolean {
  return DEFAULT_BUILTIN_WRITABLE_TOOL_NAMES.includes(toolName as (typeof DEFAULT_BUILTIN_WRITABLE_TOOL_NAMES)[number]);
}

/**
 * 创建内置工具的选项
 */
interface CreateBuiltinToolsOptions extends BuiltinToolBaseOptions {
  /** 获取当前待回答问题，用于避免重复发起用户选择 */
  getPendingQuestion?: () => PendingQuestionSnapshot | null;
  /** 创建用户选择问题 ID */
  createQuestionId?: () => string;
  /** Skill store 实例，提供且 initialized 时注册 skill 工具 */
  skillStore?: SkillStoreLike;
}

/**
 * 创建内置工具列表
 * @param options - 创建选项
 * @returns 工具执行器列表
 */
export function createBuiltinTools(options: CreateBuiltinToolsOptions = {}): AIToolExecutor[] {
  // 创建文档只读工具
  const readTools = createBuiltinReadTools();
  // 创建环境只读工具
  const environmentTools = createBuiltinEnvironmentTools();
  // 创建日志只读工具
  const logTools = createBuiltinLogTools();
  // 创建 MCP 配置工具，读工具不需要真实确认，写工具仅在 options.confirm 存在时暴露。
  const mcpSettingsTools = createBuiltinMCPSettingsTools(options.confirm ?? { confirm: async () => false });
  // 先汇总全部只读工具，再通过共享清单筛选默认暴露项。
  const allReadonlyTools: AIToolExecutor[] = [
    readTools.readCurrentDocument,
    environmentTools.getCurrentTime,
    createAskUserQuestionTool({
      getPendingQuestion: options.getPendingQuestion ?? (() => null),
      createQuestionId: options.createQuestionId ?? (() => nanoid())
    }),
    createBuiltinReadFileTool({
      confirm: options.confirm,
      getWorkspaceRoot: options.getWorkspaceRoot,
      isFileInRecent: options.isFileInRecent,
      findFileByPath: options.findFileByPath,
      getEditorContext: options.getEditorContext
    }),

    createBuiltinReadDirectoryTool({
      confirm: options.confirm,
      getWorkspaceRoot: options.getWorkspaceRoot,
      isFileInRecent: options.isFileInRecent
    }),
    createBuiltinSettingsTools(options.confirm ?? { confirm: async () => false }).getSettings,
    mcpSettingsTools.getMcpSettings,
    logTools.queryLogs
  ];
  const readonlyTools = allReadonlyTools.filter((tool) => isDefaultBuiltinReadonlyToolName(tool.definition.name));

  // 没有确认适配器时只返回只读工具
  if (!options.confirm) {
    return readonlyTools;
  }

  // 创建文件级写入工具
  const editFileTool = createBuiltinEditFileTool({
    confirm: options.confirm!,
    getWorkspaceRoot: options.getWorkspaceRoot
  });
  const writeFileTool = createBuiltinWriteFileTool({
    confirm: options.confirm!,
    getWorkspaceRoot: options.getWorkspaceRoot,
    openDraft: options.openDraft
  });
  // 创建设置修改工具
  const settingsTools = createBuiltinSettingsTools(options.confirm);
  // 创建 MCP 配置写工具
  const writableMcpSettingsTools = createBuiltinMCPSettingsTools(options.confirm);
  // 先汇总默认文件写工具，再通过共享清单筛选默认暴露项。
  const allDefaultWritableTools: AIToolExecutor[] = [
    editFileTool,
    writeFileTool,
    settingsTools.updateSettings,
    writableMcpSettingsTools.addMcpServer,
    writableMcpSettingsTools.updateMcpServer,
    writableMcpSettingsTools.removeMcpServer,
    writableMcpSettingsTools.refreshMcpDiscovery
  ];
  const writableTools = allDefaultWritableTools.filter((tool) => isDefaultBuiltinWritableToolName(tool.definition.name));

  // Skill 工具：初始化完成后注册，description 动态反映可用 skill
  const skillTool = options.skillStore?.initialized ? createSkillTool(options.skillStore) : null;

  return [...readonlyTools, ...writableTools, ...(skillTool ? [skillTool] : [])];
}
