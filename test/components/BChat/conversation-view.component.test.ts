/**
 * @file conversation-view.component.test.ts
 * @description BChat ConversationView 渲染记忆更新测试。
 * @vitest-environment jsdom
 */
import type { ChatMessageToolPart } from 'types/chat';
import type { DefineComponent } from 'vue';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import ConversationView from '@/components/BChat/components/ConversationView.vue';
import type { Message } from '@/components/BChat/utils/types';

vi.mock('@/components/BChat/components/MessageBubble.vue', () => ({
  default: {
    name: 'MessageBubble',
    props: {
      message: {
        type: Object,
        required: true
      }
    },
    template: '<div data-testid="message-bubble">{{ message.parts[0].status }}:{{ message.parts[0].result?.status ?? "" }}</div>'
  }
}));

/** ConversationView 测试所需 props。 */
interface ConversationViewTestProps {
  /** 消息列表 */
  messages: Message[];
  /** 是否处于聊天任务中 */
  loading: boolean;
  /** 是否禁用问题交互 */
  disabled: boolean;
}

/** 带测试 props 类型的 ConversationView。 */
const ConversationViewForTest = ConversationView as DefineComponent<ConversationViewTestProps>;

/**
 * 创建提问工具片段。
 * @param status - 工具片段状态
 * @param resultStatus - 工具执行结果状态
 * @returns 工具片段
 */
function createQuestionToolPart(status: ChatMessageToolPart['status'], resultStatus?: 'awaiting_user_input'): ChatMessageToolPart {
  const part: ChatMessageToolPart = {
    type: 'tool',
    toolCallId: 'tool-call-question',
    toolName: 'question',
    status,
    input: {
      question: '确认下单生椰拿铁，实付 9.9?',
      mode: 'single',
      options: [{ label: '确认下单', value: 'confirm' }]
    }
  };

  if (resultStatus) {
    part.result = {
      toolName: 'question',
      status: resultStatus,
      data: {
        questionId: 'question-1',
        toolCallId: 'tool-call-question',
        question: '确认下单生椰拿铁，实付 9.9?',
        mode: 'single',
        options: [{ label: '确认下单', value: 'confirm' }]
      }
    };
  }

  return part;
}

/**
 * 创建 assistant 消息。
 * @param part - 工具片段
 * @returns assistant 消息
 */
function createAssistantMessage(part: ChatMessageToolPart): Message {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: '',
    parts: [part],
    createdAt: '2026-06-22T00:00:00.000Z',
    loading: false,
    finished: false
  };
}

describe('ConversationView', (): void => {
  it('updates a tool part when status changes without message finished changing', async (): Promise<void> => {
    const wrapper = mount(ConversationViewForTest, {
      props: {
        messages: [createAssistantMessage(createQuestionToolPart('inputting'))],
        loading: true,
        disabled: false
      },
      global: {
        stubs: {
          BIcon: true
        }
      }
    });

    expect(wrapper.get('[data-testid="message-bubble"]').text()).toBe('inputting:');

    await wrapper.setProps({
      messages: [createAssistantMessage(createQuestionToolPart('done', 'awaiting_user_input'))],
      loading: true,
      disabled: false
    });
    await nextTick();

    expect(wrapper.get('[data-testid="message-bubble"]').text()).toBe('done:awaiting_user_input');
  });
});
