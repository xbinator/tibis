/**
 * @file tool-loop-policy.test.ts
 * @description AI SDK 托管工具循环重复调用收口与超时策略测试。
 */
import { describe, expect, it } from 'vitest';
import { AI_REQUEST_TIMEOUT, createRequestTimeout, getLoopStopReason, getTaskTimeout } from '../../../../../electron/main/modules/ai/tool-loop-policy.mjs';

describe('tool loop policy', (): void => {
  it('does not impose a step limit while tools continue making progress', (): void => {
    const progressiveSteps = Array.from({ length: 12 }, (_value: unknown, index: number) => ({
      toolCalls: [{ toolName: 'read', input: { path: `src/file-${index}.ts` } }]
    }));

    expect(getLoopStopReason(progressiveSteps)).toBeUndefined();
  });

  it('finalizes after consecutive equivalent tool calls', (): void => {
    expect(
      getLoopStopReason([
        { toolCalls: [{ toolName: 'search', input: { query: 'AI SDK 7', limit: 5 } }] },
        { toolCalls: [{ toolName: 'search', input: { limit: 5, query: 'AI SDK 7' } }] }
      ])
    ).toBe('repeated-tool-call');
  });

  it('keeps running when adjacent batches only partially overlap', (): void => {
    expect(
      getLoopStopReason([
        {
          toolCalls: [
            { toolName: 'read', input: { path: 'a.ts' } },
            { toolName: 'read', input: { path: 'b.ts' } }
          ]
        },
        {
          toolCalls: [
            { toolName: 'read', input: { path: 'a.ts' } },
            { toolName: 'read', input: { path: 'c.ts' } }
          ]
        }
      ])
    ).toBeUndefined();
  });

  it('treats reordered equivalent batches as repeated', (): void => {
    expect(
      getLoopStopReason([
        {
          toolCalls: [
            { toolName: 'read', input: { path: 'a.ts' } },
            { toolName: 'search', input: { query: 'sdk' } }
          ]
        },
        {
          toolCalls: [
            { toolName: 'search', input: { query: 'sdk' } },
            { toolName: 'read', input: { path: 'a.ts' } }
          ]
        }
      ])
    ).toBe('repeated-tool-call');
  });

  it('uses the fixed internal timeout policy', (): void => {
    expect(AI_REQUEST_TIMEOUT).toEqual({
      totalMs: 300_000,
      chunkMs: 90_000,
      toolMs: 60_000
    });
  });

  it('caps every SDK call by the remaining task deadline', (): void => {
    expect(createRequestTimeout(12_345)).toEqual({
      totalMs: 12_345,
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
