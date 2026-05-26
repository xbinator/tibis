/**
 * @file planner.test.ts
 * @description Planner 模块测试：消息保留规则切分、未完成交互识别。
 */
import { describe, expect, it } from 'vitest';
import type { Message } from '@/components/BChatSidebar/utils/types';

/**
 * 创建测试用基础消息。
 */
function makeMsg(overrides: Partial<Message> & { id: string }): Message {
  return {
    role: 'user',
    content: '',
    parts: [],
    loading: false,
    createdAt: new Date().toISOString(),
    ...overrides
  };
}

/**
 * 创建带工具调用的 assistant 消息。
 */
function makeToolCallMsg(id: string, toolCallId: string, toolName: string, hasResult = true): Message {
  const parts: Message['parts'] = [{ type: 'tool', status: hasResult ? 'done' : 'executing', toolCallId, toolName, input: {} }];
  if (hasResult) {
    parts[0] = {
      type: 'tool',
      status: 'done',
      toolCallId,
      toolName,
      input: {},
      result: { status: 'success', data: {} } as never
    };
  }
  return makeMsg({ id, role: 'assistant', content: 'tool call', parts });
}

/**
 * 创建含等待用户提问的工具结果消息。
 */
function makeAwaitingUserChoiceMsg(id: string): Message {
  return makeMsg({
    id,
    role: 'assistant',
    content: 'awaiting choice',
    parts: [
      {
        type: 'tool',
        status: 'done',
        toolCallId: 'tc-choice',
        toolName: 'ask_user_question',
        input: {},
        result: { status: 'awaiting_user_input', data: { questionId: 'q1', question: 'choose' } } as never
      }
    ]
  });
}

/**
 * 创建含未完成确认卡片的消息。
 */
function makePendingConfirmationMsg(id: string): Message {
  return makeMsg({
    id,
    role: 'assistant',
    content: 'pending confirmation',
    parts: [
      {
        type: 'confirmation',
        confirmationId: 'cf-1',
        toolName: 'write_file',
        title: 'Write file?',
        description: 'Need confirmation',
        riskLevel: 'write',
        confirmationStatus: 'pending',
        executionStatus: 'idle'
      } as never
    ]
  });
}

describe('planner - classifyMessages', () => {
  it('preserves messages with unfinished tool calls (no tool-result)', async () => {
    const { planCompression } = await import('@/components/BChatSidebar/utils/compression/planner');
    const msg = makeToolCallMsg('m1', 'tc-1', 'read', false);
    const messages: Message[] = [msg];

    const result = planCompression(messages, 0);
    expect(result.preservedMessages).toContain(msg);
    expect(result.compressibleMessages).not.toContain(msg);
  });

  it('does not preserve messages with completed tool calls', async () => {
    const { planCompression } = await import('@/components/BChatSidebar/utils/compression/planner');
    const msg = makeToolCallMsg('m1', 'tc-1', 'read', true);
    const messages: Message[] = [msg];

    const result = planCompression(messages, 0);
    expect(result.preservedMessages).not.toContain(msg);
  });

  it('preserves messages with awaiting user choice', async () => {
    const { planCompression } = await import('@/components/BChatSidebar/utils/compression/planner');
    const msg = makeAwaitingUserChoiceMsg('m1');
    const messages: Message[] = [msg];

    const result = planCompression(messages, 0);
    expect(result.preservedMessages).toContain(msg);
  });

  it('preserves legacy ask_user_choice awaiting messages for existing histories', async () => {
    const { planCompression } = await import('@/components/BChatSidebar/utils/compression/planner');
    const msg = makeMsg({
      id: 'm-legacy',
      role: 'assistant',
      content: 'awaiting legacy choice',
      parts: [
        {
          type: 'tool',
          status: 'done',
          toolCallId: 'tc-choice-legacy',
          toolName: 'ask_user_choice',
          input: {},
          result: { status: 'awaiting_user_input', data: { questionId: 'q-legacy', question: 'choose' } } as never
        }
      ]
    });

    const result = planCompression([msg], 0);
    expect(result.preservedMessages).toContain(msg);
  });

  it('preserves messages with pending confirmation card', async () => {
    const { planCompression } = await import('@/components/BChatSidebar/utils/compression/planner');
    const msg = makePendingConfirmationMsg('m1');
    const messages: Message[] = [msg];

    const result = planCompression(messages, 0);
    expect(result.preservedMessages).toContain(msg);
  });

  it('preserves recent messages within the preserve window', async () => {
    const { planCompression } = await import('@/components/BChatSidebar/utils/compression/planner');
    const messages: Message[] = [
      makeMsg({ id: 'm1', role: 'user', content: 'old msg 1' }),
      makeMsg({ id: 'm2', role: 'assistant', content: 'old reply 1' }),
      makeMsg({ id: 'm3', role: 'user', content: 'recent msg' }),
      makeMsg({ id: 'm4', role: 'assistant', content: 'recent reply' })
    ];

    // 保留最近 2 轮（即 4 条 user+assistant 消息）
    const result = planCompression(messages, 2);
    expect(result.preservedMessages).toHaveLength(4);
    expect(result.compressibleMessages).toHaveLength(0);
  });

  it('classifies old messages as compressible', async () => {
    const { planCompression } = await import('@/components/BChatSidebar/utils/compression/planner');
    const messages: Message[] = [
      makeMsg({ id: 'm1', role: 'user', content: 'old msg 1' }),
      makeMsg({ id: 'm2', role: 'assistant', content: 'old reply 1' }),
      makeMsg({ id: 'm3', role: 'user', content: 'old msg 2' }),
      makeMsg({ id: 'm4', role: 'assistant', content: 'old reply 2' }),
      makeMsg({ id: 'm5', role: 'user', content: 'recent msg' }),
      makeMsg({ id: 'm6', role: 'assistant', content: 'recent reply' })
    ];

    // 保留最近 2 轮（即 4 条），m1-m2 应被标记为可压缩
    const result = planCompression(messages, 2);
    expect(result.compressibleMessages.length).toBeGreaterThan(0);
    expect(result.compressibleMessages).toContain(messages[0]); // m1
  });

  it('excludes current user message from compressible', async () => {
    const { planCompression } = await import('@/components/BChatSidebar/utils/compression/planner');
    const currentMsg = makeMsg({ id: 'current', role: 'user', content: 'current question' });
    const messages: Message[] = [
      makeMsg({ id: 'm1', role: 'user', content: 'old msg' }),
      makeMsg({ id: 'm2', role: 'assistant', content: 'old reply' }),
      currentMsg
    ];

    const result = planCompression(messages, 1, currentMsg.id, [currentMsg.id]);
    expect(result.compressibleMessages).not.toContain(currentMsg);
    expect(result.preservedMessages).not.toContain(currentMsg);
  });

  it('identifies preservedMessageIds for unfinished interactions in compressible range', async () => {
    const { planCompression } = await import('@/components/BChatSidebar/utils/compression/planner');
    const pendingMsg = makePendingConfirmationMsg('m2');
    const messages: Message[] = [
      makeMsg({ id: 'm1', role: 'user', content: 'old msg' }),
      pendingMsg, // 位于可压缩区间但含未完成确认
      makeMsg({ id: 'm3', role: 'user', content: 'recent msg' }),
      makeMsg({ id: 'm4', role: 'assistant', content: 'recent reply' })
    ];

    // 保留最近 1 轮（2 条），m1-m2 在可压缩区间
    const result = planCompression(messages, 1);
    // m2 有未完成确认，应放入 preservedMessageIds
    expect(result.preservedMessageIds).toContain('m2');
    expect(result.preservedMessages).toContain(pendingMsg);
  });

  it('does not preserve completed confirmations', async () => {
    const { planCompression } = await import('@/components/BChatSidebar/utils/compression/planner');
    const completedMsg = makeMsg({
      id: 'm1',
      role: 'assistant',
      content: 'done',
      parts: [
        {
          type: 'confirmation',
          confirmationId: 'cf-1',
          toolName: 'write_file',
          title: 'Write file?',
          description: 'Need confirmation',
          riskLevel: 'write',
          confirmationStatus: 'approved',
          executionStatus: 'success'
        } as never
      ]
    });
    // Need enough messages so m1 falls outside the recent window
    const messages: Message[] = [
      completedMsg,
      makeMsg({ id: 'm2', role: 'user', content: 'm2' }),
      makeMsg({ id: 'm3', role: 'assistant', content: 'm3' }),
      makeMsg({ id: 'm4', role: 'user', content: 'recent msg' }),
      makeMsg({ id: 'm5', role: 'assistant', content: 'recent reply' })
    ];

    // Preserve 1 round (2 messages), m1 falls in older section
    const result = planCompression(messages, 1);
    // Completed confirmation should be compressible, not preserved
    expect(result.preservedMessages).not.toContain(completedMsg);
    expect(result.compressibleMessages).toContain(completedMsg);
  });

  it('moves historical file-reference messages into the file-semantic layer', async () => {
    const { planCompression } = await import('@/components/BChatSidebar/utils/compression/planner');
    const messages: Message[] = [
      makeMsg({
        id: 'm1',
        role: 'user',
        content: 'Check src/app.ts lines 1-20',
        references: [
          {
            token: '{{#file:1-20}}',
            path: '/project/src/app.ts',
            selectedContent: 'const value = 1;',
            fullContent: 'const value = 1;',
            startLine: 1,
            endLine: 20
          }
        ]
      }),
      makeMsg({ id: 'm2', role: 'assistant', content: 'Done', parts: [{ type: 'text', text: 'Done' } as never] }),
      makeMsg({ id: 'm3', role: 'user', content: 'recent msg', parts: [{ type: 'text', text: 'recent msg' } as never] }),
      makeMsg({ id: 'm4', role: 'assistant', content: 'recent reply', parts: [{ type: 'text', text: 'recent reply' } as never] })
    ];

    // 保留最近 1 轮（2 条），m1-m2 在旧消息区间
    const result = planCompression(messages, 1);
    expect(result.fileSemanticMessages.map((m) => m.id)).toContain('m1');
    expect(result.compressibleMessages.map((m) => m.id)).not.toContain('m1');
  });

  it('classifies all messages as older when preserveRounds is 0', async () => {
    const { planCompression } = await import('@/components/BChatSidebar/utils/compression/planner');
    const messages: Message[] = [
      makeMsg({ id: 'm1', role: 'user', content: 'msg 1' }),
      makeMsg({ id: 'm2', role: 'assistant', content: 'reply 1' }),
      makeMsg({ id: 'm3', role: 'user', content: 'msg 2' }),
      makeMsg({ id: 'm4', role: 'assistant', content: 'reply 2' })
    ];

    const result = planCompression(messages, 0);
    expect(result.preservedMessages).toHaveLength(0);
    expect(result.compressibleMessages.length).toBeGreaterThan(0);
  });

  it('excludes additional IDs beyond currentUserMessageId', async () => {
    const { planCompression } = await import('@/components/BChatSidebar/utils/compression/planner');
    const messages: Message[] = [
      makeMsg({ id: 'm1', role: 'user', content: 'old' }),
      makeMsg({ id: 'm2', role: 'assistant', content: 'old reply' }),
      makeMsg({ id: 'm3', role: 'user', content: 'recent' }),
      makeMsg({ id: 'm4', role: 'assistant', content: 'recent reply' })
    ];

    const result = planCompression(messages, 1, undefined, ['m1']);
    // m1 被排除，不应出现在任何分类中
    expect(result.compressibleMessages.map((m) => m.id)).not.toContain('m1');
    expect(result.preservedMessages.map((m) => m.id)).not.toContain('m1');
  });

  it('never classifies user role messages as mustPreserve', async () => {
    const { planCompression } = await import('@/components/BChatSidebar/utils/compression/planner');
    // user 消息即使在旧区间也不应进入 preservedMessageIds
    const messages: Message[] = [
      makeMsg({ id: 'm1', role: 'user', content: 'old user msg' }),
      makeMsg({ id: 'm2', role: 'assistant', content: 'old reply' }),
      makeMsg({ id: 'm3', role: 'user', content: 'recent' }),
      makeMsg({ id: 'm4', role: 'assistant', content: 'recent reply' })
    ];

    const result = planCompression(messages, 1);
    // user 消息不会进入 preservedMessageIds（只有含未完成交互的 assistant 消息才会）
    expect(result.preservedMessageIds).not.toContain('m1');
  });
});
