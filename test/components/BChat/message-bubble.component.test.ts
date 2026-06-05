/**
 * @file message-bubble.component.test.ts
 * @description MessageBubble 加载状态传递规则测试。
 * @vitest-environment jsdom
 */
import type { ChatMessagePart, ChatMessageToolPart } from 'types/chat';
import { shallowMount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import MessageBubble from '@/components/BChatSidebar/components/MessageBubble.vue';
import type { Message } from '@/components/BChatSidebar/utils/types';

vi.mock('@/components/BBubble/index.vue', () => ({
  default: {
    name: 'BBubble',
    props: {
      loading: {
        type: Boolean,
        default: undefined
      },
      placement: {
        type: String,
        default: 'left'
      },
      showContainer: {
        type: Boolean,
        default: true
      },
      size: {
        type: String,
        default: 'fill'
      }
    },
    template: '<section><slot name="header"></slot><slot></slot></section>'
  }
}));

vi.mock('@/components/BImageViewer/index.vue', () => ({
  default: {
    name: 'BImageViewer',
    template: '<div />'
  }
}));

vi.mock('@/components/BChatSidebar/components/MessageBubble/BubblePartCompression.vue', () => ({
  default: {
    name: 'BubblePartCompression',
    template: '<div />'
  }
}));

vi.mock('@/components/BChatSidebar/components/MessageBubble/BubblePartText.vue', () => ({
  default: {
    name: 'BubblePartText',
    template: '<div />'
  }
}));

vi.mock('@/components/BChatSidebar/components/MessageBubble/BubblePartThinking.vue', () => ({
  default: {
    name: 'BubblePartThinking',
    template: '<div />'
  }
}));

vi.mock('@/components/BChatSidebar/components/MessageBubble/BubblePartTool.vue', () => ({
  default: {
    name: 'BubblePartTool',
    template: '<div />'
  }
}));

vi.mock('@/components/BChatSidebar/components/MessageBubble/BubblePartUserInput.vue', () => ({
  default: {
    name: 'BubblePartUserInput',
    template: '<div />'
  }
}));

vi.mock('@/components/BChatSidebar/components/QuestionCard.vue', () => ({
  default: {
    name: 'QuestionCard',
    template: '<div />'
  }
}));

vi.mock('@/hooks/useClipboard', () => ({
  useClipboard: () => ({
    clipboard: vi.fn()
  })
}));

/**
 * 创建基础消息对象，便于按用例覆盖差异字段。
 * @param overrides - 待覆盖的消息字段
 * @returns 测试用消息对象
 */
function createMessage(overrides: Partial<Message>): Message {
  return {
    id: 'message-1',
    role: 'assistant',
    content: '',
    parts: [],
    createdAt: '2026-06-05T00:00:00.000Z',
    ...overrides
  };
}

/**
 * 创建等待用户选择的问题工具片段。
 * @returns 等待用户输入状态的工具片段
 */
function createAwaitingQuestionPart(): ChatMessageToolPart {
  return {
    type: 'tool',
    toolCallId: 'tool-call-1',
    toolName: 'question',
    status: 'done',
    input: {},
    result: {
      toolName: 'question',
      status: 'awaiting_user_input',
      data: {
        questionId: 'question-1',
        toolCallId: 'tool-call-1',
        mode: 'single',
        question: '继续执行吗？',
        options: [{ label: '继续', value: 'continue' }]
      }
    }
  };
}

describe('MessageBubble loading state', () => {
  it('keeps BBubble loading enabled while an assistant message is loading', (): void => {
    const wrapper = shallowMount(MessageBubble, {
      props: {
        message: createMessage({
          loading: true,
          parts: [{ type: 'text', text: '正在处理' }]
        })
      }
    });

    expect(wrapper.findComponent({ name: 'BBubble' }).props('loading')).toBe(true);
  });

  it('does not pass BBubble loading while waiting for a question answer', (): void => {
    const questionPart = createAwaitingQuestionPart();
    const parts: ChatMessagePart[] = [questionPart];
    const wrapper = shallowMount(MessageBubble, {
      props: {
        message: createMessage({
          loading: true,
          parts
        })
      }
    });

    expect(wrapper.findComponent({ name: 'BBubble' }).props('loading')).toBeUndefined();
  });
});
