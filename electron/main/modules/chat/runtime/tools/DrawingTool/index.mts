/**
 * @file index.mts
 * @description ChatRuntime 主进程画板工具。
 */
import type { ChatRuntimeMainToolExecutionInput } from '../../types.mjs';
import type { MainToolsDependencies, RuntimeCreateDrawingInput } from '../types.mjs';
import type { AIToolExecutionResult } from 'types/ai';
import {
  applyDrawingOperationsToData,
  createDrawingDraftContent,
  createDrawingDraftResult,
  createEmptyDrawingData,
  normalizeDrawingTitle
} from '../../drawing-runtime.mjs';
import { APPLY_DRAWING_OPERATIONS_TOOL_NAME, CREATE_DRAWING_TOOL_NAME, DRAWING_TOOL_NAMES } from '../constants.mjs';
import { isRecord, isRuntimeDrawingSnapshot, isRuntimeOpenDraftResult } from '../guards.mjs';
import { createBridgeFailureResult, createMainToolCancelledResult, createMainToolFailureResult, createMainToolSuccessResult } from '../results.mjs';

/**
 * 判断工具是否属于画板工具模块。
 * @param toolName - 工具名称
 * @returns 是否为画板工具
 */
export function isDrawingTool(toolName: string): boolean {
  return DRAWING_TOOL_NAMES.has(toolName);
}

/**
 * 归一化 create_drawing 输入。
 * @param input - 原始工具输入
 * @returns 归一化创建画板输入
 */
function normalizeRuntimeCreateDrawingInput(input: unknown): RuntimeCreateDrawingInput {
  const source = isRecord(input) ? input : {};
  return {
    title: normalizeDrawingTitle(typeof source.title === 'string' ? source.title : undefined),
    operations: Array.isArray(source.operations) ? source.operations : []
  };
}

/**
 * 执行 create_drawing 工具。
 * @param input - 工具执行输入
 * @param deps - 主进程工具依赖
 * @returns 工具执行结果
 */
async function executeCreateDrawingTool(input: ChatRuntimeMainToolExecutionInput, deps: MainToolsDependencies): Promise<AIToolExecutionResult> {
  const normalizedInput = normalizeRuntimeCreateDrawingInput(input.input);
  const applied = applyDrawingOperationsToData(createEmptyDrawingData(), normalizedInput.operations);
  if (!applied.ok) {
    return createMainToolFailureResult(input.toolName, 'INVALID_INPUT', applied.message);
  }

  const bridgeResult = await deps.requestBridge({
    runtimeId: input.runtime.runtimeId,
    toolCallId: input.toolCallId,
    kind: 'open-draft',
    payload: {
      originalPath: `${normalizedInput.title}.tibis`,
      content: createDrawingDraftContent(applied.data)
    }
  });
  if (bridgeResult.status === 'failure') return createBridgeFailureResult(input.toolName, bridgeResult.error);
  if (!isRuntimeOpenDraftResult(bridgeResult.data)) return createMainToolFailureResult(input.toolName, 'INVALID_INPUT', '草稿创建结果格式无效');

  return createMainToolSuccessResult(CREATE_DRAWING_TOOL_NAME, createDrawingDraftResult(bridgeResult.data, applied.data));
}

/**
 * 执行 apply_drawing_operations 工具。
 * @param input - 工具执行输入
 * @param deps - 主进程工具依赖
 * @returns 工具执行结果
 */
async function executeApplyDrawingOperationsTool(input: ChatRuntimeMainToolExecutionInput, deps: MainToolsDependencies): Promise<AIToolExecutionResult> {
  const source = isRecord(input.input) ? input.input : {};
  if (!Array.isArray(source.operations)) {
    return createMainToolFailureResult(input.toolName, 'INVALID_INPUT', 'operations 必须是数组');
  }

  const snapshotResult = await deps.requestBridge({
    runtimeId: input.runtime.runtimeId,
    toolCallId: input.toolCallId,
    kind: 'drawing-snapshot',
    payload: input.input
  });
  if (snapshotResult.status === 'failure') return createBridgeFailureResult(input.toolName, snapshotResult.error);
  if (!isRuntimeDrawingSnapshot(snapshotResult.data)) return createMainToolFailureResult(input.toolName, 'INVALID_INPUT', '当前画板快照格式无效');

  const applied = applyDrawingOperationsToData(snapshotResult.data.data, source.operations);
  if (!applied.ok) {
    return createMainToolFailureResult(input.toolName, 'INVALID_INPUT', applied.message);
  }

  const decision = await deps.requestConfirmation({
    runtimeId: input.runtime.runtimeId,
    toolCallId: input.toolCallId,
    request: {
      toolCallId: input.toolCallId,
      toolName: APPLY_DRAWING_OPERATIONS_TOOL_NAME,
      title: 'AI 想要修改当前画板',
      description: `AI 请求对当前画板执行 ${applied.appliedOperations} 个操作。`,
      riskLevel: 'write',
      beforeText: JSON.stringify(snapshotResult.data.data, null, 2),
      afterText: JSON.stringify(applied.data, null, 2)
    }
  });
  if (!decision.approved) return createMainToolCancelledResult(input.toolName);

  const bridgeResult = await deps.requestBridge({
    runtimeId: input.runtime.runtimeId,
    toolCallId: input.toolCallId,
    kind: 'apply-drawing-data',
    payload: { data: applied.data }
  });
  if (bridgeResult.status === 'failure') return createBridgeFailureResult(input.toolName, bridgeResult.error);
  if (!isRuntimeDrawingSnapshot(bridgeResult.data)) return createMainToolFailureResult(input.toolName, 'INVALID_INPUT', '画板写回结果格式无效');

  return createMainToolSuccessResult(APPLY_DRAWING_OPERATIONS_TOOL_NAME, {
    id: bridgeResult.data.id,
    title: bridgeResult.data.title,
    path: bridgeResult.data.path,
    data: bridgeResult.data.data,
    appliedOperations: applied.appliedOperations
  });
}

/**
 * 执行画板工具。
 * @param input - 工具执行输入
 * @param deps - 主进程工具依赖
 * @returns 工具执行结果
 */
export async function executeDrawingTool(input: ChatRuntimeMainToolExecutionInput, deps: MainToolsDependencies): Promise<AIToolExecutionResult> {
  if (input.toolName === CREATE_DRAWING_TOOL_NAME) return executeCreateDrawingTool(input, deps);
  if (input.toolName === APPLY_DRAWING_OPERATIONS_TOOL_NAME) return executeApplyDrawingOperationsTool(input, deps);
  return createMainToolFailureResult(input.toolName, 'TOOL_NOT_FOUND', `Unsupported drawing tool: ${input.toolName}`);
}
