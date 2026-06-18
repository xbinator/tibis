/**
 * @file context-estimator.test.ts
 * @description ChatRuntime 序列化上下文 token 估算测试。
 */
import type { ModelMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { estimateSerializedModelMessages, estimateTextTokens } from '../../../../../../electron/main/modules/chat/runtime/context-estimator.mjs';

describe('chat runtime context estimator', (): void => {
  it('estimates serialized model messages with four characters per token', (): void => {
    const messages: ModelMessage[] = [{ role: 'user', content: '12345678' }];
    const expected = Math.ceil(JSON.stringify(messages).length / 4);

    expect(estimateSerializedModelMessages(messages)).toBe(expected);
  });

  it('returns zero for empty messages', (): void => {
    expect(estimateSerializedModelMessages([])).toBe(0);
  });

  it('estimates text tokens with the same cheap heuristic', (): void => {
    expect(estimateTextTokens('123456789')).toBe(3);
  });

  it('counts image parts through serialized payload shape', (): void => {
    const messages: ModelMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'look' },
          { type: 'image', image: 'data:image/png;base64,abcdef' }
        ]
      }
    ];

    expect(estimateSerializedModelMessages(messages)).toBe(Math.ceil(JSON.stringify(messages).length / 4));
  });
});
