/**
 * @file context-estimator.test.ts
 * @description ChatRuntime 序列化上下文 token 估算测试。
 */
import type { ModelMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { estimateSerializedModelMessages, estimateTextTokens } from '../../../../../../electron/main/modules/chat/runtime/context/estimator.mjs';

describe('chat runtime context estimator', (): void => {
  it('estimates text message content through the shared weighted heuristic', (): void => {
    const messages: ModelMessage[] = [{ role: 'user', content: '12345678' }];

    expect(estimateSerializedModelMessages(messages)).toBe(3);
  });

  it('returns zero for empty messages', (): void => {
    expect(estimateSerializedModelMessages([])).toBe(0);
  });

  it('estimates text tokens with the same cheap heuristic', (): void => {
    expect(estimateTextTokens('123456789')).toBe(3);
  });

  it('counts structured parts through their serialized payload shape', (): void => {
    const textPart = { type: 'text', text: 'look' } as const;
    const imagePart = { type: 'image', image: 'data:image/png;base64,abcdef' } as const;
    const messages: ModelMessage[] = [
      {
        role: 'user',
        content: [textPart, imagePart]
      }
    ];
    const expected = estimateTextTokens(JSON.stringify(textPart)) + estimateTextTokens(JSON.stringify(imagePart));

    expect(estimateSerializedModelMessages(messages)).toBe(expected);
  });
});
