/**
 * @file tool-output-prune.test.ts
 * @description ChatRuntime 旧工具结果剪枝辅助函数测试。
 */
import type { ChatMessageRecord, ChatMessageToolPart } from 'types/chat';
import { describe, expect, it } from 'vitest';
import {
  findToolOutputPruneProtectedStartIndex,
  pruneMessageToolOutputs
} from '../../../../../../electron/main/modules/chat/runtime/context/tool-output-prune.mjs';

/**
 * 创建 assistant 工具消息。
 * @param toolPart - 工具片段
 * @returns assistant 消息
 */
function createAssistantToolMessage(toolPart: ChatMessageToolPart): ChatMessageRecord {
  return {
    id: 'assistant-1',
    sessionId: 'session-1',
    role: 'assistant',
    content: '',
    parts: [toolPart],
    createdAt: '2026-06-19T00:00:00.000Z',
    finished: true
  };
}

describe('tool output prune helpers', () => {
  it('prunes large successful tool result data while preserving summary fields', (): void => {
    const toolPart: ChatMessageToolPart = {
      type: 'tool',
      toolCallId: 'tool-call-1',
      toolName: 'read_file',
      status: 'done',
      input: { path: 'large.md' },
      result: {
        toolName: 'read_file',
        status: 'success',
        data: {
          path: 'large.md',
          content: 'x'.repeat(5_000)
        }
      }
    };
    const message = createAssistantToolMessage(toolPart);

    const prunedMessage = pruneMessageToolOutputs(message);

    expect(prunedMessage?.parts[0]).toMatchObject({
      type: 'tool',
      result: {
        status: 'success',
        data: {
          path: 'large.md',
          pruned: true,
          originalBytes: expect.any(Number)
        }
      }
    });
  });

  it('keeps user choice tool results unpruned', (): void => {
    const toolPart: ChatMessageToolPart = {
      type: 'tool',
      toolCallId: 'tool-call-1',
      toolName: 'ask_user_choice',
      status: 'done',
      input: { question: '继续吗？' },
      result: {
        toolName: 'ask_user_choice',
        status: 'success',
        data: { answer: 'x'.repeat(5_000) }
      }
    };
    const message = createAssistantToolMessage(toolPart);

    expect(pruneMessageToolOutputs(message)).toBeUndefined();
  });

  it('protects the latest two user turns from pruning', (): void => {
    const messages = [
      { id: 'user-1', role: 'user' },
      { id: 'assistant-1', role: 'assistant' },
      { id: 'user-2', role: 'user' },
      { id: 'assistant-2', role: 'assistant' },
      { id: 'user-3', role: 'user' },
      { id: 'assistant-3', role: 'assistant' }
    ] as ChatMessageRecord[];

    expect(findToolOutputPruneProtectedStartIndex(messages)).toBe(2);
  });
});
