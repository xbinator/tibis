/**
 * @file token-estimator.test.ts
 * @description 上下文压缩确定性 Token 估算测试。
 */
import type { ChatMessageRecord } from 'types/chat';
import { describe, expect, it } from 'vitest';
import {
  estimatePartTokens,
  estimateRequestTokens,
  estimateTextTokens
} from '../../../../../../../electron/main/modules/chat/runtime/compaction/token-estimator.mjs';

/**
 * 创建用户消息测试数据。
 * @param text - 用户消息文本
 * @returns 用户消息
 */
function createUserMessage(text: string): ChatMessageRecord {
  return {
    id: 'user-1',
    sessionId: 'session-1',
    role: 'user',
    content: text,
    parts: [{ id: 'text-1', type: 'text', text }],
    createdAt: '2026-07-16T00:00:00.000Z',
    finished: true
  };
}

describe('compaction token estimator', (): void => {
  it('对相同文本返回确定结果且随内容单调增加', (): void => {
    const shortTokens = estimateTextTokens('hello');
    const longTokens = estimateTextTokens('hello world');

    expect(shortTokens).toBe(2);
    expect(estimateTextTokens('hello')).toBe(shortTokens);
    expect(longTokens).toBeGreaterThan(shortTokens);
  });

  it('对 CJK 文本使用比 ASCII 更保守的字符权重', (): void => {
    expect(estimateTextTokens('上下文压缩')).toBeGreaterThan(estimateTextTokens('abcdef'));
  });

  it('估算 system、tool schema 和模型消息的完整请求', (): void => {
    const baseTokens = estimateRequestTokens({ system: '遵循用户要求', messages: [createUserMessage('修复问题')] });
    const withToolTokens = estimateRequestTokens({
      system: '遵循用户要求',
      messages: [createUserMessage('修复问题')],
      tools: [
        {
          name: 'read_file',
          description: '读取文件',
          parameters: {
            type: 'object',
            properties: { path: { type: 'string' } },
            required: ['path']
          }
        }
      ]
    });

    expect(baseTokens).toBeGreaterThan(0);
    expect(withToolTokens).toBeGreaterThan(baseTokens);
  });

  it('忽略不会直接进入模型请求的 compaction part', (): void => {
    expect(
      estimatePartTokens({
        id: 'checkpoint-1',
        type: 'compaction',
        status: 'pending',
        trigger: 'automatic',
        createdAt: 1
      })
    ).toBe(0);
  });
});
