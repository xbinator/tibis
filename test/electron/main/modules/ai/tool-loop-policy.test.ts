/**
 * @file tool-loop-policy.test.ts
 * @description AI SDK 托管工具循环固定收口策略测试。
 */
import { describe, expect, it } from 'vitest';
import {
  AI_REQUEST_TIMEOUT,
  createRequestTimeout,
  getLoopStopReason,
  getTaskTimeout,
  TOOL_LOOP_MAX_STEPS
} from '../../../../../electron/main/modules/ai/tool-loop-policy.mjs';

describe('tool loop policy', (): void => {
  it('keeps normal tool progress below the fixed step limit', (): void => {
    expect(
      getLoopStopReason(
        [{ toolCalls: [{ toolName: 'search', input: { query: 'AI SDK 7' } }] }, { toolCalls: [{ toolName: 'read', input: { url: 'https://example.com' } }] }],
        2
      )
    ).toBeUndefined();
  });

  it('reserves the fifth generation step for the final answer', (): void => {
    expect(getLoopStopReason([], TOOL_LOOP_MAX_STEPS - 1)).toBe('step-limit');
  });

  it('finalizes after consecutive equivalent tool calls', (): void => {
    expect(
      getLoopStopReason(
        [
          { toolCalls: [{ toolName: 'search', input: { query: 'AI SDK 7', limit: 5 } }] },
          { toolCalls: [{ toolName: 'search', input: { limit: 5, query: 'AI SDK 7' } }] }
        ],
        2
      )
    ).toBe('repeated-tool-call');
  });

  it('uses the fixed internal timeout policy', (): void => {
    expect(AI_REQUEST_TIMEOUT).toEqual({
      totalMs: 300_000,
      stepMs: 120_000,
      chunkMs: 90_000,
      toolMs: 60_000
    });
  });

  it('caps every SDK call by the remaining task deadline', (): void => {
    expect(createRequestTimeout(12_345)).toEqual({
      totalMs: 12_345,
      stepMs: 120_000,
      chunkMs: 90_000,
      toolMs: 60_000
    });
    expect(createRequestTimeout(600_000)).toEqual(AI_REQUEST_TIMEOUT);
  });

  it('calculates the fixed task-wide remaining time', (): void => {
    expect(getTaskTimeout(1_000, 121_000)).toBe(180_000);
    expect(getTaskTimeout(1_000, 301_000)).toBe(0);
  });
});
