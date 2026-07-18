/**
 * @file tool-loop-policy.mts
 * @description AI SDK 托管工具循环的重复调用停止条件、超时与最终回答策略。
 */
import type { Instructions, PrepareStepFunction, PrepareStepResult, TimeoutConfiguration, ToolSet } from 'ai';
import { isEqual } from 'lodash-es';
import { log } from '../logger/service.mjs';

/** 连续相同工具调用触发最终回答所需的步骤数。 */
const REPEATED_TOOL_STEP_LIMIT = 2;

/** 关闭工具后的最终回答约束，防止模型把内部工具协议当普通文本输出。 */
const FINAL_ANSWER_INSTRUCTION = [
  'Tools are disabled for this final response because the previous tool step repeated without progress.',
  'Answer the user using the tool results already present in the conversation.',
  'Do not emit tool-call markup, XML-like tool protocol, JSON tool envelopes, or claim to run another tool.'
].join(' ');

/** 所有模型调用共享的固定超时策略。 */
export const AI_REQUEST_TIMEOUT = {
  totalMs: 300_000,
  chunkMs: 90_000,
  toolMs: 60_000
} as const satisfies TimeoutConfiguration<ToolSet>;

/** 单次用户任务允许占用的总时长。 */
export const AI_TASK_TIMEOUT_MS = AI_REQUEST_TIMEOUT.totalMs;

/** 工具调用比较所需的最小快照。 */
export interface ToolCallSnapshot {
  /** 工具名称。 */
  toolName: string;
  /** 工具输入。 */
  input: unknown;
}

/** 模型步骤比较所需的最小快照。 */
export interface ToolStepSnapshot {
  /** 当前步骤产生的工具调用。 */
  toolCalls: ToolCallSnapshot[];
}

/** 工具循环进入最终回答阶段的原因。 */
export type ToolLoopStopReason = 'repeated-tool-call';

/** AI SDK prepareStep 的入参类型。 */
type ToolStepOptions = Parameters<PrepareStepFunction<ToolSet>>[0];

/**
 * 按任务剩余时间创建单次 SDK 调用超时。
 * @param totalMs - 当前任务剩余毫秒数
 * @returns 不超过固定任务上限的 SDK 超时配置
 */
export function createRequestTimeout(totalMs: number = AI_TASK_TIMEOUT_MS): TimeoutConfiguration<ToolSet> {
  const normalizedTotalMs = Math.max(1, Math.min(AI_TASK_TIMEOUT_MS, Math.floor(totalMs)));
  return { ...AI_REQUEST_TIMEOUT, totalMs: normalizedTotalMs };
}

/**
 * 计算一次用户任务当前剩余的运行时间。
 * @param startedAt - 任务启动时间戳
 * @param currentAt - 当前时间戳
 * @returns 剩余毫秒数；超时后返回 0
 */
export function getTaskTimeout(startedAt: number, currentAt: number = Date.now()): number {
  return Math.max(0, AI_TASK_TIMEOUT_MS - Math.max(0, currentAt - startedAt));
}

/**
 * 判断最后两个工具步骤是否出现相同工具与相同输入。
 * @param steps - 已完成的模型步骤
 * @returns 是否应阻止再次执行相同调用
 */
function hasRepeatedToolCall(steps: ToolStepSnapshot[]): boolean {
  const toolSteps = steps.filter((step: ToolStepSnapshot): boolean => step.toolCalls.length > 0);
  if (toolSteps.length < REPEATED_TOOL_STEP_LIMIT) return false;

  const latestCalls = toolSteps[toolSteps.length - 1].toolCalls;
  const previousCalls = toolSteps[toolSteps.length - 2].toolCalls;
  if (latestCalls.length !== previousCalls.length) return false;

  // 按无序多重集合比较整个步骤，避免 A+B 后的 A+C 因一个重叠调用被误判为死循环。
  const unmatchedCalls = [...previousCalls];
  for (const latestCall of latestCalls) {
    const matchIndex = unmatchedCalls.findIndex(
      (previousCall: ToolCallSnapshot): boolean => latestCall.toolName === previousCall.toolName && isEqual(latestCall.input, previousCall.input)
    );
    if (matchIndex < 0) return false;
    unmatchedCalls.splice(matchIndex, 1);
  }

  return true;
}

/**
 * 在原 instructions 后追加最终回答协议约束。
 * @param instructions - 原始模型 instructions
 * @returns 保留原语义并附加收口约束的 instructions
 */
export function appendFinalInstructions(instructions: Instructions | undefined): Instructions {
  if (!instructions) return FINAL_ANSWER_INSTRUCTION;
  if (typeof instructions === 'string') return `${instructions}\n\n${FINAL_ANSWER_INSTRUCTION}`;

  const finalInstruction = { role: 'system' as const, content: FINAL_ANSWER_INSTRUCTION };
  return Array.isArray(instructions) ? [...instructions, finalInstruction] : [instructions, finalInstruction];
}

/**
 * 计算工具循环是否应进入最终回答阶段。
 * @param steps - 已完成的模型步骤
 * @returns 收口原因；工具仍在正常推进时返回 undefined
 */
export function getLoopStopReason(steps: ToolStepSnapshot[]): ToolLoopStopReason | undefined {
  if (hasRepeatedToolCall(steps)) return 'repeated-tool-call';
  return undefined;
}

/**
 * 连续重复调用同一工具时关闭工具，避免无效循环并生成可见回答。
 * @param options - AI SDK 当前步骤上下文
 * @returns 当前步骤的工具选择覆盖
 */
export function prepareToolStep(options: ToolStepOptions): PrepareStepResult<ToolSet> {
  const reason = getLoopStopReason(options.steps);
  if (!reason) return {};

  log.info('[AIService] Tool loop finalizing:', { reason, stepNumber: options.stepNumber });
  return { toolChoice: 'none', instructions: appendFinalInstructions(options.instructions) };
}
