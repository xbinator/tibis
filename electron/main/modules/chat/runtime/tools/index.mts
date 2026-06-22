/**
 * @file index.mts
 * @description ChatRuntime 主进程工具执行入口。
 */
import type { ChatRuntimeMainToolExecutionInput } from '../types.mjs';
import type { MainToolExecutor, MainToolsDependencies } from './types.mjs';
import { executeDrawingTool, isDrawingTool } from './DrawingTool/index.mjs';
import { executeFileTool, isFileTool } from './FileTool/index.mjs';
import { executeReadTool, isReadTool } from './ReadTool/index.mjs';
import { executeResourceTool, isResourceTool } from './ResourceTool/index.mjs';
import { createMainToolFailureResult } from './results.mjs';
import { executeSettingsTool, isSettingsTool } from './SettingsTool/index.mjs';
import { executeWebviewTool, isWebviewTool } from './WebviewTool/index.mjs';

/**
 * 创建主进程工具执行器。
 * @param deps - 主进程工具依赖
 * @returns 主进程工具执行函数
 */
export function createMainToolExecutor(deps: MainToolsDependencies): MainToolExecutor {
  return async (input: ChatRuntimeMainToolExecutionInput) => {
    if (isReadTool(input.toolName)) return executeReadTool(input, deps);
    if (isFileTool(input.toolName)) return executeFileTool(input, deps);
    if (isSettingsTool(input.toolName)) return executeSettingsTool(input, deps);
    if (isDrawingTool(input.toolName)) return executeDrawingTool(input, deps);
    if (isResourceTool(input.toolName)) return executeResourceTool(input, deps);
    if (isWebviewTool(input.toolName)) return executeWebviewTool(input, deps);

    return createMainToolFailureResult(input.toolName, 'TOOL_NOT_FOUND', `Unsupported main-process tool: ${input.toolName}`);
  };
}
