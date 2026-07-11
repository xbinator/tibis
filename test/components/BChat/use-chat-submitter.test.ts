/**
 * @file use-chat-submitter.test.ts
 * @description BChat 统一提交器测试。
 */
import { ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { useChatSubmitter } from '@/components/BChat/hooks/useChatSubmitter';
import type { AdaptedUserMessageInput, MessagePartUpdateInput, SubmitAction } from '@/components/BChat/utils/submitAction';
import type { Message } from '@/components/BChat/utils/types';

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

/**
 * 创建消息 part 更新提交动作。
 * @param input - 消息 part 更新输入
 * @returns 提交动作
 */
function createMessagePartUpdateAction(input: MessagePartUpdateInput): SubmitAction {
  return {
    async run(context): Promise<void> {
      await context.updateMessagePart(input);
    }
  };
}

describe('useChatSubmitter', (): void => {
  it('sends adapted user messages while the Session workflow accepts input', async (): Promise<void> => {
    const sendRuntimeUserMessage = vi.fn<(_input: AdaptedUserMessageInput) => Promise<void>>(() => Promise.resolve());
    const input = createAdaptedUserMessageInput();
    const submitter = useChatSubmitter({
      isWorkflowBusy: () => false,
      messages: ref<Message[]>([]),
      getSessionId: () => 'session-1',
      getActiveRuntimeId: () => undefined,
      resolveRuntimeRequestConfig: vi.fn(),
      submitUserChoice: vi.fn(),
      sendRuntimeUserMessage,
      submitRuntimeMessagePart: vi.fn(),
      updateSessionMessage: vi.fn()
    });

    await submitter.submit(createSendAdaptedUserMessageAction(input));

    expect(sendRuntimeUserMessage).toHaveBeenCalledWith(input);
  });

  it('does not send adapted user messages while the Session workflow is busy', async (): Promise<void> => {
    const sendRuntimeUserMessage = vi.fn<(_input: AdaptedUserMessageInput) => Promise<void>>(() => Promise.resolve());
    const input = createAdaptedUserMessageInput();
    const submitter = useChatSubmitter({
      isWorkflowBusy: () => true,
      messages: ref<Message[]>([]),
      getSessionId: () => 'session-1',
      getActiveRuntimeId: () => undefined,
      resolveRuntimeRequestConfig: vi.fn(),
      submitUserChoice: vi.fn(),
      sendRuntimeUserMessage,
      submitRuntimeMessagePart: vi.fn(),
      updateSessionMessage: vi.fn()
    });

    await submitter.submit(createSendAdaptedUserMessageAction(input));

    expect(sendRuntimeUserMessage).not.toHaveBeenCalled();
  });

  it('submits message part updates to the active runtime when a chat turn is running', async (): Promise<void> => {
    const messages = ref<Message[]>([
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '',
        parts: [
          {
            id: 'part-open-widget',
            type: 'tool',
            toolCallId: 'tool-call-widget',
            toolName: 'open_widget',
            status: 'done',
            input: { id: 'weather' }
          }
        ],
        createdAt: '2026-07-06T00:00:00.000Z'
      }
    ]);
    const submitRuntimeMessagePart = vi.fn<() => Promise<void>>(() => Promise.resolve());
    const updateSessionMessage = vi.fn<() => Promise<void>>(() => Promise.resolve());
    const submitter = useChatSubmitter({
      isWorkflowBusy: () => true,
      messages,
      getSessionId: () => 'session-1',
      getActiveRuntimeId: () => 'runtime-1',
      resolveRuntimeRequestConfig: vi.fn(),
      submitUserChoice: vi.fn(),
      sendRuntimeUserMessage: vi.fn(),
      submitRuntimeMessagePart,
      updateSessionMessage
    });

    await submitter.submit(
      createMessagePartUpdateAction({
        messageId: 'assistant-1',
        part: {
          id: 'part-open-widget',
          type: 'tool',
          toolCallId: 'tool-call-widget',
          toolName: 'open_widget',
          status: 'done',
          input: { id: 'weather' },
          result: { toolName: 'open_widget', status: 'success', data: { ok: true } }
        }
      })
    );

    expect(submitRuntimeMessagePart).toHaveBeenCalledWith({
      runtimeId: 'runtime-1',
      messageId: 'assistant-1',
      part: expect.objectContaining({
        id: 'part-open-widget',
        result: { toolName: 'open_widget', status: 'success', data: { ok: true } }
      })
    });
    expect(updateSessionMessage).not.toHaveBeenCalled();
  });
});
