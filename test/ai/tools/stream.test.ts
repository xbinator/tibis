/**
 * @file stream.test.ts
 * @description AI 工具流式消息转换测试。
 */
import { describe, expect, it } from 'vitest';
import { createToolResultMessages } from '@/ai/tools/stream';

describe('createToolResultMessages', (): void => {
  it('serializes tool results as JSON values before sending them to the model', (): void => {
    const messages = createToolResultMessages([
      {
        toolCallId: 'tool-call-json',
        toolName: 'json_tool',
        input: {},
        result: {
          toolName: 'json_tool',
          status: 'success',
          data: {
            kept: 'ok',
            dropped: undefined,
            nested: {
              dropped: undefined
            }
          }
        }
      }
    ]);

    expect(messages[0]).toStrictEqual({
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'tool-call-json',
          toolName: 'json_tool',
          output: {
            type: 'json',
            value: {
              toolName: 'json_tool',
              status: 'success',
              data: {
                kept: 'ok',
                nested: {}
              }
            }
          }
        }
      ]
    });
    const content = messages[0]?.content;
    if (!Array.isArray(content) || content[0]?.type !== 'tool-result' || content[0].output.type !== 'json') {
      throw new Error('Expected tool result model message');
    }
    const outputValue = content[0].output.value as { data: Record<string, unknown> };
    expect(Object.prototype.hasOwnProperty.call(outputValue.data, 'dropped')).toBe(false);
  });
});
