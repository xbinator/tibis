/**
 * @file message-bubble-part-text.component.test.ts
 * @description BubblePartText 渲染行为测试。
 */
/* @vitest-environment jsdom */

import { defineComponent } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import BubblePartText from '@/components/BChatSidebar/components/MessageBubble/BubblePartText.vue';
import MessageBubble from '@/components/BChatSidebar/components/MessageBubble.vue';
import type { Message } from '@/components/BChatSidebar/utils/types';

/**
 * Markdown 消息占位组件，用于观察 assistant 文本是否仍按原路径渲染。
 */
const MessageStub = defineComponent({
  name: 'BMessage',
  props: {
    content: {
      type: String,
      required: true
    },
    type: {
      type: String,
      required: false,
      default: ''
    },
    loading: {
      type: Boolean,
      required: false,
      default: false
    }
  },
  template: '<div class="message-stub" :data-type="type" :data-loading="String(loading)">{{ content }}</div>'
});

/**
 * BBubble 占位组件，保留默认插槽内容。
 */
const BubbleStub = defineComponent({
  name: 'BBubble',
  template: '<div class="bubble-stub"><slot name="header" /><slot /><slot name="toolbar" /></div>'
});

/**
 * 按钮占位组件。
 */
const ButtonStub = defineComponent({
  name: 'BButton',
  template: '<button type="button"><slot /></button>'
});

/**
 * 图标占位组件。
 */
const IconStub = defineComponent({
  name: 'Icon',
  template: '<i></i>'
});

/**
 * 挂载文本片段组件。
 * @param options - 挂载参数。
 * @returns 挂载结果。
 */
function mountTextPart(options: { part: { type: 'text'; text: string } | { type: 'error'; text: string } }): VueWrapper {
  return mount(BubblePartText, {
    props: {
      part: options.part
    },
    global: {
      stubs: {
        BMessage: MessageStub
      }
    }
  });
}

/**
 * 挂载消息气泡组件。
 * @param message - 测试消息。
 * @returns 挂载结果。
 */
function mountBubble(message: Message): VueWrapper {
  return mount(MessageBubble, {
    props: { message },
    global: {
      stubs: {
        BBubble: BubbleStub,
        BButton: ButtonStub,
        BMessage: MessageStub,
        Icon: IconStub,
        BubblePartThinking: true,
        BubblePartTool: true,
        QuestionCard: true,
        BubblePartUserInput: true,
        BubblePartCompression: true
      }
    }
  });
}

describe('BubblePartText', () => {
  it('renders text part using BMessage component', () => {
    const wrapper = mountTextPart({
      part: { type: 'text', text: 'Hello world' }
    });

    const message = wrapper.get('.message-stub');
    expect(message.text()).toBe('Hello world');
    expect(message.attributes('data-type')).toBe('markdown');
  });

  it('renders error part with error styling', () => {
    const wrapper = mountTextPart({
      part: { type: 'error', text: 'Error message' }
    });

    expect(wrapper.classes()).toContain('message-bubble-text--error');
    const message = wrapper.get('.message-stub');
    expect(message.text()).toBe('Error message');
  });
});

describe('MessageBubble assistant rendering', () => {
  it('keeps assistant text on the existing markdown rendering path', () => {
    const wrapper = mountBubble({
      id: 'assistant-1',
      role: 'assistant',
      content: '请查看 {{@demo.ts:12-14}}',
      createdAt: '2026-04-25T00:00:00.000Z',
      parts: [{ type: 'text', text: '请查看 {{@demo.ts:12-14}}' }],
      references: []
    });

    const message = wrapper.get('.message-stub');

    expect(message.attributes('data-type')).toBe('markdown');
    expect(message.text()).toContain('{{@demo.ts:12-14}}');
  });
});
