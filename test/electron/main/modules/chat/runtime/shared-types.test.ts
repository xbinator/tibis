import type { ChatMessageRecord } from 'types/chat';
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
});
