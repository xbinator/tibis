/**
 * @file builtin/index.ts
 * @description 内置工具工厂函数，内置工具名称清单与默认暴露策略
 */
import type { BuiltinToolBaseOptions } from '../shared/types';
import type { AIToolExecutor } from 'types/ai';
import { nanoid } from 'nanoid';
import { native } from '@/shared/platform';
import { CREATE_DOCUMENT_TOOL_NAME, READ_CURRENT_DOCUMENT_TOOL_NAME, createBuiltinDocumentWriteTool, createBuiltinReadTools } from './DocumentTool';
import { GET_CURRENT_TIME_TOOL_NAME, createBuiltinEnvironmentTools } from './EnvironmentTool';
import { EDIT_FILE_TOOL_NAME, createBuiltinEditFileTool } from './FileEditTool';
import { createBuiltinReadDirectoryTool, createBuiltinReadFileTool, READ_DIRECTORY_TOOL_NAME, READ_FILE_TOOL_NAME } from './FileReadTool';
import { createBuiltinWriteFileTool, WRITE_FILE_TOOL_NAME } from './FileWriteTool';
import { createBuiltinLogTools, QUERY_LOGS_TOOL_NAME } from './LogsTool';
import {
  ADD_MCP_SERVER_TOOL_NAME,
  createBuiltinMCPTools,
  GET_MCP_SETTINGS_TOOL_NAME,
  hasMcpServers,
  REFRESH_MCP_DISCOVERY_TOOL_NAME,
  REMOVE_MCP_SERVER_TOOL_NAME,
  UPDATE_MCP_SERVER_TOOL_NAME,
  type MCPStoreLike
} from './MCPTool';
import { EDIT_MEMORY_TOOL_NAME, createBuiltinEditMemoryTool } from './MemoryTool';
import { QUESTION_TOOL_NAME, createQuestionTool, type PendingQuestionSnapshot } from './QuestionTool';
import { createBuiltinSettingsTools, GET_SETTINGS_TOOL_NAME, UPDATE_SETTINGS_TOOL_NAME } from './SettingsTool';
import { createBuiltinShellCommandTool, RUN_SHELL_COMMAND_TOOL_NAME } from './ShellTool';
import { createSkillTool, SKILL_TOOL_NAME, type SkillStoreLike } from './SkillTool';
import { TODO_WRITE_TOOL_NAME, createBuiltinTodoWriteTool } from './TodoWriteTool';

// 重新导出工具名称
export { CREATE_DOCUMENT_TOOL_NAME, READ_CURRENT_DOCUMENT_TOOL_NAME } from './DocumentTool';
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
} from './MCPTool';
export { LEGACY_ASK_USER_QUESTION_TOOL_NAME, QUESTION_TOOL_NAME } from './QuestionTool';
export { GET_SETTINGS_TOOL_NAME, UPDATE_SETTINGS_TOOL_NAME } from './SettingsTool';
export { RUN_SHELL_COMMAND_TOOL_NAME } from './ShellTool';
export { SKILL_TOOL_NAME } from './SkillTool';
export { TODO_WRITE_TOOL_NAME } from './TodoWriteTool';
export { EDIT_MEMORY_TOOL_NAME } from './MemoryTool';

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
  if (SDK_MANAGED_TOOL_NAMES.includes(toolName as (typeof SDK_MANAGED_TOOL_NAMES)[number])) {
    return true;
  }
  if (toolName.startsWith('mcp_')) {
    return true;
  }
  return false;
}

/**
 * 默认开放的只读内置工具名称列表。
 * MCP 工具和 Skill 工具为条件注册，不在此默认列表中。
 */
export const DEFAULT_BUILTIN_READONLY_TOOL_NAMES = [
  READ_CURRENT_DOCUMENT_TOOL_NAME,
  GET_CURRENT_TIME_TOOL_NAME,
  QUESTION_TOOL_NAME,
  READ_FILE_TOOL_NAME,
  GET_SETTINGS_TOOL_NAME,
  QUERY_LOGS_TOOL_NAME
] as const;

/**
 * 默认开放的内置写工具名称列表。
 * MCP 写工具为条件注册，不在此默认列表中。
 */
export const DEFAULT_BUILTIN_WRITABLE_TOOL_NAMES = [
  CREATE_DOCUMENT_TOOL_NAME,
  EDIT_FILE_TOOL_NAME,
  WRITE_FILE_TOOL_NAME,
  UPDATE_SETTINGS_TOOL_NAME,
  RUN_SHELL_COMMAND_TOOL_NAME,
  EDIT_MEMORY_TOOL_NAME
] as const;

/**
 * 条件注册的只读工具名称列表（MCP/Skill 等，有内容时才注册）。
 */
export const CONDITIONAL_BUILTIN_READONLY_TOOL_NAMES = [READ_DIRECTORY_TOOL_NAME, GET_MCP_SETTINGS_TOOL_NAME, SKILL_TOOL_NAME] as const;

/**
 * 条件注册的写工具名称列表（MCP 写操作等，有内容时才注册）。
 */
export const CONDITIONAL_BUILTIN_WRITABLE_TOOL_NAMES = [
  ADD_MCP_SERVER_TOOL_NAME,
  UPDATE_MCP_SERVER_TOOL_NAME,
  REMOVE_MCP_SERVER_TOOL_NAME,
  REFRESH_MCP_DISCOVERY_TOOL_NAME
] as const;

/**
 * 所有内置工具名称列表（默认 + 条件），用于聊天侧白名单过滤。
 */
export const ALL_BUILTIN_TOOL_NAMES = [
  ...DEFAULT_BUILTIN_READONLY_TOOL_NAMES,
  ...DEFAULT_BUILTIN_WRITABLE_TOOL_NAMES,
  ...CONDITIONAL_BUILTIN_READONLY_TOOL_NAMES,
  ...CONDITIONAL_BUILTIN_WRITABLE_TOOL_NAMES,
  TODO_WRITE_TOOL_NAME
] as const;

/**
 * 获取默认聊天工具名称列表。
 * @returns 默认聊天工具名称数组
 */
export function getDefaultBuiltinChatToolNames(): string[] {
  return [...ALL_BUILTIN_TOOL_NAMES];
}

/**
 * 判断工具名称是否属于内置工具白名单（含条件注册工具）。
 * @param toolName - 工具名称
 * @returns 是否为内置工具
 */
export function isBuiltinToolName(toolName: string): boolean {
  return ALL_BUILTIN_TOOL_NAMES.includes(toolName as (typeof ALL_BUILTIN_TOOL_NAMES)[number]);
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
  /** MCP store 实例，有已配置 server 时注册 MCP 工具 */
  mcpStore?: MCPStoreLike;
  /** Skill store 实例，有可用 skill 时注册 skill 工具 */
  skillStore?: SkillStoreLike;
  /** 获取当前活跃会话 ID，用于 todowrite 工具 */
  getSessionId?: () => string | undefined;
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
  // 先汇总全部只读工具，再通过共享清单筛选默认暴露项。
  const allReadonlyTools: AIToolExecutor[] = [
    readTools.readCurrentDocument,
    environmentTools.getCurrentTime,
    createQuestionTool({
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
    createBuiltinSettingsTools(options.confirm ?? { confirm: async () => false }).getSettings,
    logTools.queryLogs
  ];
  const readonlyTools = allReadonlyTools.filter((tool) => isDefaultBuiltinReadonlyToolName(tool.definition.name));

  // read_directory 工具：仅当存在工作区根目录时注册
  const hasWorkspace = Boolean(options.getWorkspaceRoot?.());
  const readDirectoryTool = hasWorkspace
    ? createBuiltinReadDirectoryTool({
        confirm: options.confirm,
        getWorkspaceRoot: options.getWorkspaceRoot,
        isFileInRecent: options.isFileInRecent
      })
    : null;

  // MCP 只读工具：仅当存在已配置的 MCP server 时注册
  const mcpHasContent = options.mcpStore ? hasMcpServers(options.mcpStore) : false;
  const mcpReadTool = mcpHasContent ? createBuiltinMCPTools(options.confirm ?? { confirm: async () => false }).getMcpSettings : null;

  // 创建文档写工具（创建新文档），始终注册，不依赖确认适配器
  const documentWriteTools = createBuiltinDocumentWriteTool({
    openDraft: options.openDraft
  });

  // 没有确认适配器时只返回只读工具 + 始终注册的写工具
  if (!options.confirm) {
    return [
      ...readonlyTools,
      ...(readDirectoryTool ? [readDirectoryTool] : []),
      ...(mcpReadTool ? [mcpReadTool] : []),
      createBuiltinTodoWriteTool({ getSessionId: options.getSessionId ?? (() => undefined) }),
      documentWriteTools.createDocument,
      createBuiltinEditMemoryTool()
    ];
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
  // 已启用 Skill 的目录也可作为 Shell 执行安全边界，用于运行 Skill 自带脚本。
  // 注意：skillStore 在 onMounted 中异步初始化，不能在工具创建时静态捕获 skill 列表，
  // getAdditionalShellWorkspaceRoots 必须在每次调用时动态从 store 读取最新数据。
  const enabledSkills = options.skillStore?.getEnabledSkills() ?? [];
  // 创建危险级 Shell 命令工具，仅当 Electron 原生桥接支持时注册。
  const shellCommandTool = native.supportsShellCommand()
    ? createBuiltinShellCommandTool({
        confirm: options.confirm!,
        getWorkspaceRoot: options.getWorkspaceRoot,
        getAdditionalShellWorkspaceRoots: () => (options.skillStore?.getEnabledSkills() ?? []).map((skill) => skill.dirPath)
      })
    : null;
  // 先汇总默认文件写工具，再通过共享清单筛选默认暴露项。
  const allDefaultWritableTools: AIToolExecutor[] = [
    documentWriteTools.createDocument,
    editFileTool,
    writeFileTool,
    settingsTools.updateSettings,
    ...(shellCommandTool ? [shellCommandTool] : []),
    createBuiltinEditMemoryTool()
  ];
  const writableTools = allDefaultWritableTools.filter((tool) => isDefaultBuiltinWritableToolName(tool.definition.name));

  // MCP 写工具：仅当存在已配置的 MCP server 时注册
  const mcpWriteTools = mcpHasContent ? createBuiltinMCPTools(options.confirm) : null;

  // Skill 工具：仅当有可用 skill 时注册
  const skillTool = options.skillStore?.initialized && enabledSkills.length > 0 ? createSkillTool(options.skillStore) : null;

  // todowrite 工具：无条件注册
  const todoWriteTool = createBuiltinTodoWriteTool({
    getSessionId: options.getSessionId ?? (() => undefined)
  });

  return [
    ...readonlyTools,
    ...(readDirectoryTool ? [readDirectoryTool] : []),
    ...(mcpReadTool ? [mcpReadTool] : []),
    ...writableTools,
    ...(mcpWriteTools ? [mcpWriteTools.addMcpServer, mcpWriteTools.updateMcpServer, mcpWriteTools.removeMcpServer, mcpWriteTools.refreshMcpDiscovery] : []),
    ...(skillTool ? [skillTool] : []),
    todoWriteTool
  ];
}
