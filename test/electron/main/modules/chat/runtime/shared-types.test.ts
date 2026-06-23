import type { ChatMessageFilePart, ChatMessageFilePartInput, ChatMessagePart, ChatMessageRecord } from 'types/chat';
import type { ChatRuntimeContextUsageSnapshot, ChatRuntimeSendInput } from 'types/chat-runtime';
import { describe, expect, it } from 'vitest';

describe('chat runtime shared types', (): void => {
  it('allows runtime command inputs and message ownership fields', (): void => {
    const input: ChatRuntimeSendInput = {
      sessionId: 'session-1',
      clientId: 'client-1',
      agentId: 'agent-1',
      content: 'hello'
    };

    const snapshot: ChatRuntimeContextUsageSnapshot = {
      runtimeId: 'runtime-1',
      sessionId: 'session-1',
      agentId: 'agent-1',
      contextWindow: 200000,
      reservedOutputTokens: 8192,
      compactionBufferTokens: 20000,
      usableInputTokens: 171808,
      estimatedInputTokens: 1000,
      usagePercent: 1,
      remainingInputTokens: 170808,
      status: 'safe',
      shouldCompactBeforeSend: false
    };

    const message: ChatMessageRecord = {
      id: 'message-1',
      sessionId: 'session-1',
      role: 'assistant',
      content: 'summary',
      parts: [{ type: 'compaction', auto: false, reason: 'manual', status: 'success', tailStartMessageId: 'message-tail' }],
      createdAt: '2026-06-18T00:00:00.000Z',
      summary: true,
      agentId: input.agentId,
      runtimeId: snapshot.runtimeId,
      meta: {
        contextUsage: snapshot
      }
    };

    expect(message.parts[0].type).toBe('compaction');
    expect(message.summary).toBe(true);
    expect(message.meta?.contextUsage?.runtimeId).toBe('runtime-1');
  });

  it('accepts input file parts without snapshots and persisted file parts with snapshots', (): void => {
    const inputPart: ChatMessageFilePartInput = {
      type: 'file',
      id: 'file-part-1',
      filename: 'foo.ts',
      mime: 'text/plain',
      url: 'file:///workspace/src/foo.ts?start=10&end=20',
      path: 'src/foo.ts',
      sourceText: { start: 4, end: 27, value: '{{@src/foo.ts#L10-L20}}' }
    };

    const persistedPart: ChatMessageFilePart = {
      ...inputPart,
      snapshot: {
        content: 'export const foo = 1;',
        startLine: 10,
        endLine: 20,
        totalLines: 100,
        contentHash: 'hash-1',
        capturedAt: '2026-06-20T00:00:00.000Z'
      }
    };

    const messagePart: ChatMessagePart = persistedPart;
    const sendInput: Pick<ChatRuntimeSendInput, 'parts'> = { parts: [{ type: 'text', text: 'fix ' }, inputPart] };

    expect(messagePart.type).toBe('file');
    expect(sendInput.parts?.[1]?.type).toBe('file');
  });
});
