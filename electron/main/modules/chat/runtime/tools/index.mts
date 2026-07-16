/**
 * @file index.mts
 * @description ChatRuntime 主进程工具执行入口。
 */
import type { ChatRuntimeMainToolExecutionInput } from '../types.mjs';
import type { MainToolExecutor, MainToolsDependencies } from './types.mjs';
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
    // 工具无需逐个手动透传 signal，统一在依赖边界注入到所有 bridge 与确认请求。
    const toolDeps: MainToolsDependencies = input.signal
      ? {
          ...deps,
          requestBridge: (request) => deps.requestBridge({ ...request, signal: input.signal }),
          requestConfirmation: (request) => deps.requestConfirmation({ ...request, signal: input.signal })
        }
      : deps;

    if (isReadTool(input.toolName)) return executeReadTool(input, toolDeps);
    if (isFileTool(input.toolName)) return executeFileTool(input, toolDeps);
    if (isSettingsTool(input.toolName)) return executeSettingsTool(input, toolDeps);
    if (isResourceTool(input.toolName)) return executeResourceTool(input, toolDeps);
    if (isWebviewTool(input.toolName)) return executeWebviewTool(input, toolDeps);

    return createMainToolFailureResult(input.toolName, 'TOOL_NOT_FOUND', `Unsupported main-process tool: ${input.toolName}`);
  };
}
