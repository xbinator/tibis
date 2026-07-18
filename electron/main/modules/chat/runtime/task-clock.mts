/**
 * @file task-clock.mts
 * @description ChatRuntime 任务级超时的可暂停执行时钟。
 */
import type { ActiveChatRuntime } from './types.mjs';
import { AI_TASK_TIMEOUT_MS } from '../../ai/tool-loop-policy.mjs';

/**
 * 读取 runtime 已暂停的总时长。
 * @param runtime - 当前 runtime
 * @param now - 当前时间戳
 * @returns 已暂停毫秒数
 */
export function getRuntimeTaskPausedMs(runtime: ActiveChatRuntime, now: number = Date.now()): number {
  const completedPausedMs = runtime.taskPausedDurationMs ?? 0;
  const activePausedMs = runtime.taskPauseDepth && runtime.taskPausedAt !== undefined ? Math.max(0, now - runtime.taskPausedAt) : 0;

  return completedPausedMs + activePausedMs;
}

/**
 * 读取 runtime 剩余的任务级执行时间。
 * @param runtime - 当前 runtime
 * @param now - 当前时间戳
 * @returns 剩余执行毫秒数
 */
export function getRuntimeTaskTimeout(runtime: ActiveChatRuntime, now: number = Date.now()): number {
  const activeElapsedMs = Math.max(0, now - runtime.createdAt - getRuntimeTaskPausedMs(runtime, now));
  return Math.max(0, AI_TASK_TIMEOUT_MS - activeElapsedMs);
}

/**
 * 读取 runtime 当前任务截止时间。
 * @param runtime - 当前 runtime
 * @param now - 当前时间戳
 * @returns 当前任务截止时间戳
 */
export function getRuntimeTaskDeadlineAt(runtime: ActiveChatRuntime, now: number = Date.now()): number {
  return runtime.createdAt + AI_TASK_TIMEOUT_MS + getRuntimeTaskPausedMs(runtime, now);
}

/**
 * 暂停 runtime 任务级执行时钟。
 * @param runtime - 当前 runtime
 * @param now - 当前时间戳
 */
export function pauseRuntimeTaskClock(runtime: ActiveChatRuntime, now: number = Date.now()): void {
  const currentDepth = runtime.taskPauseDepth ?? 0;
  runtime.taskPauseDepth = currentDepth + 1;
  if (currentDepth === 0) {
    runtime.taskPausedAt = now;
  }
}

/**
 * 恢复 runtime 任务级执行时钟。
 * @param runtime - 当前 runtime
 * @param now - 当前时间戳
 */
export function resumeRuntimeTaskClock(runtime: ActiveChatRuntime, now: number = Date.now()): void {
  const currentDepth = runtime.taskPauseDepth ?? 0;
  if (currentDepth <= 0) return;

  const nextDepth = currentDepth - 1;
  runtime.taskPauseDepth = nextDepth;
  if (nextDepth > 0) return;

  if (runtime.taskPausedAt !== undefined) {
    runtime.taskPausedDurationMs = (runtime.taskPausedDurationMs ?? 0) + Math.max(0, now - runtime.taskPausedAt);
  }
  runtime.taskPausedAt = undefined;
}
