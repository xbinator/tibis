/**
 * @file use-chat-submitter.test.ts
 * @description BChat 统一提交器测试。
 */
import { ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { useChatSubmitter } from '@/components/BChat/hooks/useChatSubmitter';
import type { ChatTaskStartResult, ChatTaskState } from '@/components/BChat/hooks/useChatTaskRuntime';
import type { AdaptedUserMessageInput, SubmitAction } from '@/components/BChat/utils/submitAction';

/**
 * 创建已适配好的用户消息输入。
 * @returns 用户消息输入
 */
function createAdaptedUserMessageInput(): AdaptedUserMessageInput {
  return {
    userMessage: {
      id: 'user-widget-message',
      role: 'user',
      content: '确认下单',
      parts: [{ id: 'part-user-text', type: 'text', text: '确认下单' }],
      createdAt: '2026-07-06T00:00:00.000Z',
      finished: true
    },
    parts: [{ id: 'part-user-text', type: 'text', text: '确认下单' }]
  };
}

/**
 * 创建发送已适配用户消息的提交动作。
 * @param input - 用户消息输入
 * @returns 提交动作
 */
function createSendAdaptedUserMessageAction(input: AdaptedUserMessageInput): SubmitAction {
  return {
    async run(context): Promise<void> {
      await context.sendAdaptedUserMessage(input);
    }
  };
}

describe('useChatSubmitter', (): void => {
  it('sends adapted user messages while the chat task is already active', async (): Promise<void> => {
    const activeTask = ref<ChatTaskState>('chat');
    const beginTask = vi.fn<(_kind: 'chat' | 'compact') => ChatTaskStartResult>(() => ({ ok: false, reason: 'busy' }));
    const sendRuntimeUserMessage = vi.fn<(_input: AdaptedUserMessageInput) => Promise<void>>(() => Promise.resolve());
    const input = createAdaptedUserMessageInput();
    const submitter = useChatSubmitter({
      taskRuntime: {
        activeTask,
        beginTask,
        finishTask: vi.fn()
      },
      getSessionId: () => 'session-1',
      resolveRuntimeRequestConfig: vi.fn(),
      submitUserChoice: vi.fn(),
      sendRuntimeUserMessage
    });

    await submitter.submit(createSendAdaptedUserMessageAction(input));

    expect(beginTask).not.toHaveBeenCalled();
    expect(sendRuntimeUserMessage).toHaveBeenCalledWith(input);
  });
});
