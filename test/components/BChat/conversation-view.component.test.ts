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
      },
      disabled: {
        type: Boolean,
        default: false
      },
      canRollback: {
        type: Function,
        default: undefined
      }
    },
    template: [
      '<div data-testid="message-bubble">',
      '{{ message.parts[0]?.status ?? message.role }}:',
      '{{ message.parts[0]?.result?.status ?? "" }}:',
      '{{ disabled ? "disabled" : "enabled" }}:',
      '{{ canRollback && canRollback(message) ? "rollback" : "no-rollback" }}',
      '</div>'
    ].join('')
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
  /** 判断消息是否可回退 */
  canRollback?: (message: Message) => boolean;
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

/**
 * 创建用户消息。
 * @param id - 消息 ID
 * @returns 用户消息
 */
function createUserMessage(id: string): Message {
  return {
    id,
    role: 'user',
    content: '你好',
    parts: [{ type: 'text', text: '你好' }],
    createdAt: '2026-06-22T00:00:00.000Z',
    loading: false,
    finished: true
  };
}

describe('ConversationView', (): void => {
  it('hides the back bottom button while loading at the bottom', (): void => {
    const wrapper = mount(ConversationViewForTest, {
      props: {
        messages: [],
        loading: true,
        disabled: false
      },
      global: {
        stubs: {
          BIcon: true
        }
      }
    });

    expect(wrapper.get('.to-bottom').classes()).not.toContain('to-bottom--visible');
  });

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

    expect(wrapper.get('[data-testid="message-bubble"]').text()).toBe('inputting::enabled:no-rollback');

    await wrapper.setProps({
      messages: [createAssistantMessage(createQuestionToolPart('done', 'awaiting_user_input'))],
      loading: true,
      disabled: false
    });
    await nextTick();

    expect(wrapper.get('[data-testid="message-bubble"]').text()).toBe('done:awaiting_user_input:enabled:no-rollback');
  });

  it('updates disabled state without message content changing', async (): Promise<void> => {
    const messages = [createAssistantMessage(createQuestionToolPart('done', 'awaiting_user_input'))];
    const wrapper = mount(ConversationViewForTest, {
      props: {
        messages,
        loading: true,
        disabled: false
      },
      global: {
        stubs: {
          BIcon: true
        }
      }
    });

    expect(wrapper.get('[data-testid="message-bubble"]').text()).toBe('done:awaiting_user_input:enabled:no-rollback');

    await wrapper.setProps({
      messages,
      loading: true,
      disabled: true
    });
    await nextTick();

    expect(wrapper.get('[data-testid="message-bubble"]').text()).toBe('done:awaiting_user_input:disabled:no-rollback');
  });

  it('updates rollback visibility when following messages change', async (): Promise<void> => {
    const userMessage = createUserMessage('user-1');
    let messages: Message[] = [userMessage];
    const canRollback = (message: Message): boolean => {
      const index = messages.findIndex((item) => item.id === message.id);

      return index >= 0 && messages.slice(index + 1).some((item) => item.role === 'assistant' || item.role === 'interrupt');
    };
    const wrapper = mount(ConversationViewForTest, {
      props: {
        messages,
        loading: true,
        disabled: false,
        canRollback
      },
      global: {
        stubs: {
          BIcon: true
        }
      }
    });

    expect(wrapper.get('[data-testid="message-bubble"]').text()).toBe('user::enabled:no-rollback');

    messages = [userMessage, createAssistantMessage(createQuestionToolPart('done', 'awaiting_user_input'))];
    await wrapper.setProps({
      messages,
      loading: true,
      disabled: false,
      canRollback
    });
    await nextTick();

    expect(wrapper.findAll('[data-testid="message-bubble"]')[0].text()).toBe('user::enabled:rollback');
  });
});
