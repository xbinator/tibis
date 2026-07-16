/**
 * @file stream/index.mts
 * @description ChatRuntime 主进程模型流式执行器主循环与公共入口。
 */
import type { ChatRuntimeStreamExecutor, ChatRuntimeStreamExecutorResult } from '../types.mjs';
import type { RuntimeStreamExecutorDependencies, RuntimeStreamText } from './types.mjs';
import type { AIUsage, AIToolExecutionResult } from 'types/ai';
import { AI_ERROR_CODE, createAIServiceError } from '../../../ai/errors/codes.mjs';
import { AI_TASK_TIMEOUT_MS } from '../../../ai/tool-loop-policy.mjs';
import { toRuntimeStreamChunk } from './chunks.mjs';
import { sanitizeFinalText } from './final-text.mjs';
import {
  appendReasoningDelta,
  appendTextDelta,
  appendToolCall,
  appendToolInputDelta,
  appendToolInputEnd,
  appendToolInputStart,
  appendToolResult,
  finishAssistantMessage
} from './message-parts.mjs';
import { createRuntimeStreamRequest } from './request.mjs';
import {
  createUnknownToolFailureResult,
  executeMainToolSafely,
  executeRendererToolSafely,
  isMainProcessTool,
  isRendererManagedTool,
  normalizeRendererToolTimeoutMs,
  normalizeRuntimeError,
  shouldContinueAfterToolResult,
  shouldStopStreamAfterToolResult
} from './tools.mjs';

export type { RuntimeStreamText, RuntimeStreamExecutorDependencies };

/**
 * 创建 ChatRuntime 模型流式执行器。
 * @param dependencies - 执行器依赖
 * @returns runtime 流式执行器
 */
export function createRuntimeStreamExecutor(dependencies: RuntimeStreamExecutorDependencies): ChatRuntimeStreamExecutor {
  return async (
    { runtime, sourceMessages, userMessage, assistantMessage, forceFinal = false, totalTimeoutMs = AI_TASK_TIMEOUT_MS },
    updateAssistant
  ): Promise<ChatRuntimeStreamExecutorResult> => {
    runtime.currentToolStep = { toolCalls: [] };
    const resolution = runtime.resolvedModel ?? (await dependencies.resolver.resolve());
    if (!resolution) {
      throw createAIServiceError(AI_ERROR_CODE.MODEL_NOT_FOUND, '没有可用的聊天模型');
    }

    const [error, result] = await dependencies.streamText(
      resolution.createOptions,
      createRuntimeStreamRequest(resolution.modelId, runtime, userMessage, sourceMessages),
      { runtimeToolLoop: true, forceFinal, totalTimeoutMs }
    );
    if (error) {
      throw error;
    }
    if (!result) {
      throw createAIServiceError(AI_ERROR_CODE.REQUEST_FAILED, 'ChatRuntime 流式调用未返回结果');
    }

    let stepUsage: AIUsage | undefined;
    let totalUsage: AIUsage | undefined;
    let finishReason: import('types/ai').AIStreamFinishReason | undefined;
    let executedToolCount = 0;
    let allToolsContinueable = true;
    let anyToolStopped = false;
    let isWaitingForUserInput = false;
    let finalTextBuffer = '';
    const runtimeToolTimeoutMs = Math.min(normalizeRendererToolTimeoutMs(dependencies.rendererToolTimeoutMs), totalTimeoutMs);

    for await (const rawChunk of result.stream) {
      const chunk = toRuntimeStreamChunk(rawChunk);

      if (chunk.type === 'text-delta') {
        if (forceFinal) {
          // 收口调用先完整缓冲，避免跨 chunk 的协议标记在流式 UI 中短暂泄漏。
          finalTextBuffer += chunk.text;
          continue;
        }
        appendTextDelta(assistantMessage, chunk.text);
        await updateAssistant(assistantMessage);
      } else if (chunk.type === 'reasoning-delta') {
        appendReasoningDelta(assistantMessage, chunk.text);
        await updateAssistant(assistantMessage);
      } else if (chunk.type === 'finish-step') {
        stepUsage = chunk.stepUsage;
      } else if (chunk.type === 'finish') {
        finishReason = chunk.finishReason;
        totalUsage = chunk.totalUsage;
      } else if (chunk.type === 'error') {
        throw normalizeRuntimeError(chunk.error);
      } else if (chunk.type === 'abort') {
        throw createAIServiceError(AI_ERROR_CODE.REQUEST_FAILED, chunk.reason?.trim() || '模型流已中止');
      } else if (chunk.type === 'tool-input-start') {
        appendToolInputStart(assistantMessage, chunk);
        await updateAssistant(assistantMessage);
      } else if (chunk.type === 'tool-input-delta') {
        appendToolInputDelta(assistantMessage, chunk);
        await updateAssistant(assistantMessage);
      } else if (chunk.type === 'tool-input-end') {
        appendToolInputEnd(assistantMessage, chunk);
        await updateAssistant(assistantMessage);
      } else if (chunk.type === 'tool-call') {
        runtime.currentToolStep.toolCalls.push({ toolName: chunk.toolName, input: chunk.input });
        appendToolCall(assistantMessage, chunk);
        await updateAssistant(assistantMessage);

        const toolExecutionInput = {
          runtime,
          toolCallId: chunk.toolCallId,
          toolName: chunk.toolName,
          input: chunk.input
        };

        let toolResult: AIToolExecutionResult | undefined;
        if (dependencies.executeMainTool && isMainProcessTool(chunk.toolName)) {
          toolResult = await executeMainToolSafely(dependencies.executeMainTool, toolExecutionInput, runtimeToolTimeoutMs);
        } else if (dependencies.executeRendererTool && isRendererManagedTool(runtime, chunk.toolName)) {
          toolResult = await executeRendererToolSafely(dependencies.executeRendererTool, toolExecutionInput, runtimeToolTimeoutMs);
        }

        if (toolResult) {
          appendToolResult(assistantMessage, {
            type: 'tool-result',
            toolCallId: chunk.toolCallId,
            toolName: chunk.toolName,
            result: toolResult
          });

          executedToolCount += 1;
          allToolsContinueable = allToolsContinueable && shouldContinueAfterToolResult(toolResult);
          anyToolStopped = anyToolStopped || shouldStopStreamAfterToolResult(toolResult);
          isWaitingForUserInput = isWaitingForUserInput || toolResult.status === 'awaiting_user_input';
          assistantMessage.loading = toolResult.status === 'awaiting_user_input';
          assistantMessage.finished = false;

          await updateAssistant(assistantMessage);
          if (anyToolStopped) break;
        }
      } else if (chunk.type === 'tool-result') {
        appendToolResult(assistantMessage, chunk);
        executedToolCount += 1;
        allToolsContinueable = allToolsContinueable && shouldContinueAfterToolResult(chunk.result);
        anyToolStopped = anyToolStopped || shouldStopStreamAfterToolResult(chunk.result);
        isWaitingForUserInput = isWaitingForUserInput || chunk.result.status === 'awaiting_user_input';
        assistantMessage.loading = chunk.result.status === 'awaiting_user_input';
        assistantMessage.finished = false;
        await updateAssistant(assistantMessage);
        if (anyToolStopped) break;
      }
    }

    if (forceFinal && finalTextBuffer) {
      appendTextDelta(assistantMessage, sanitizeFinalText(finalTextBuffer));
      await updateAssistant(assistantMessage);
    }

    // 流结束时仍未收到 tool-result 的 tool-call，按未注册工具兜底失败，
    // 避免 UI 长期处于 executing 状态。
    for (const part of assistantMessage.parts) {
      if (part.type !== 'tool' || part.status !== 'executing') continue;

      const toolResult = createUnknownToolFailureResult(part.toolName);
      appendToolResult(assistantMessage, {
        type: 'tool-result',
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        result: toolResult
      });

      executedToolCount += 1;
      allToolsContinueable = allToolsContinueable && shouldContinueAfterToolResult(toolResult);
      anyToolStopped = anyToolStopped || shouldStopStreamAfterToolResult(toolResult);
    }

    const shouldContinue = executedToolCount > 0 && allToolsContinueable && finishReason === 'tool-calls';
    const usageResult = {
      ...(stepUsage ? { stepUsage } : {}),
      ...(totalUsage ? { totalUsage } : {})
    };
    if (shouldContinue) return { ...usageResult, shouldContinue };
    if (isWaitingForUserInput) return usageResult;

    if (assistantMessage.finished !== true) {
      finishAssistantMessage(assistantMessage, totalUsage);
      await updateAssistant(assistantMessage);
    }

    return usageResult;
  };
}
