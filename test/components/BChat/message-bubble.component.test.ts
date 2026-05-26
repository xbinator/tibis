/**
 * @file message-bubble.component.test.ts
 * @description MessageBubble 组件确认卡片集成测试。
 */
/* @vitest-environment jsdom */

import { defineComponent } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { mount, type VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MessageBubble from '@/components/BChatSidebar/components/MessageBubble.vue';
import type { Message } from '@/components/BChatSidebar/utils/types';

/**
 * BBubble 占位组件，保留默认插槽和命名插槽。
 */
const BubbleStub = defineComponent({
  name: 'BBubble',
  props: {
    placement: {
      type: String,
      required: false,
      default: 'left'
    },
    loading: {
      type: Boolean,
      required: false,
      default: false
    },
    size: {
      type: String,
      required: false,
      default: 'fill'
    }
  },
  template: `
    <div class="bubble-stub" :data-placement="placement" :data-loading="String(loading)" :data-size="size">
      <div class="bubble-stub__header"><slot name="header" /></div>
      <div class="bubble-stub__body"><slot /></div>
      <div class="bubble-stub__toolbar"><slot name="toolbar" /></div>
    </div>
  `
});

/**
 * Markdown 消息占位组件。
 */
const MessageStub = defineComponent({
  name: 'BMessage',
  props: {
    content: {
      type: String,
      required: true
    }
  },
  template: '<div class="message-stub">{{ content }}</div>'
});

/**
 * 图标占位组件。
 */
const IconStub = defineComponent({
  name: 'Icon',
  props: {
    icon: {
      type: String,
      required: false,
      default: ''
    }
  },
  template: '<i :data-icon="icon"></i>'
});

/**
 * 按钮占位组件。
 */
const ButtonStub = defineComponent({
  name: 'BButton',
  emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\', $event)"><slot /></button>'
});

/**
 * 剪贴板 hook mock。
 */
vi.mock('@/hooks/useClipboard', () => ({
  useClipboard: () => ({
    clipboard: vi.fn()
  })
}));

/**
 * 路由 mock。
 */
vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: vi.fn()
  })
}));

/**
 * 文件存储 mock。
 */
vi.mock('@/stores/files', () => ({
  useFilesStore: () => ({
    openFile: vi.fn()
  })
}));

/**
 * localforage mock。
 */
vi.mock('localforage', () => ({
  default: {
    config: vi.fn(),
    createInstance: vi.fn(() => ({
      getItem: vi.fn(() => Promise.resolve(null)),
      setItem: vi.fn(() => Promise.resolve()),
      removeItem: vi.fn(() => Promise.resolve()),
      clear: vi.fn(() => Promise.resolve())
    })),
    getItem: vi.fn(() => Promise.resolve(null)),
    setItem: vi.fn(() => Promise.resolve()),
    removeItem: vi.fn(() => Promise.resolve()),
    clear: vi.fn(() => Promise.resolve())
  }
}));

/**
 * 创建带确认片段的消息。
 * @returns assistant 消息
 */
function createMessageWithConfirmation(): Message {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: 'AI 想要插入内容',
    createdAt: '2026-04-22T00:00:00.000Z',
    finished: true,
    parts: [
      {
        type: 'text',
        text: '先看一下变更。'
      },
      {
        type: 'confirmation',
        toolCallId: 'tool-call-1',
        confirmationId: 'confirmation-1',
        toolName: 'insert_at_cursor',
        title: 'AI 想要插入内容',
        description: 'AI 请求在当前光标位置插入新内容。',
        riskLevel: 'write',
        afterText: 'hello',
        customInput: {
          enabled: true,
          placeholder: '输入新的设置值...',
          triggerLabel: '改成别的'
        },
        confirmationStatus: 'pending',
        executionStatus: 'idle'
      }
    ]
  };
}

/**
 * 创建带文件引用的用户消息（使用文本格式）。
 * @returns user 消息
 */
function createMessageWithFileReferencePart(): Message {
  return {
    id: 'user-1',
    role: 'user',
    content: '请看 {{#foo.ts 3-5}} 这里',
    createdAt: '2026-05-02T00:00:00.000Z',
    finished: true,
    parts: [{ type: 'text', text: '请看 {{#foo.ts 3-5}} 这里' }]
  };
}

/**
 * 创建等待用户回答问题的助手消息。
 * @returns assistant 消息
 */
function createMessageWithAwaitingUserQuestion(): Message {
  return {
    id: 'assistant-question-1',
    role: 'assistant',
    content: '',
    createdAt: '2026-05-14T00:00:00.000Z',
    finished: true,
    parts: [
      {
        type: 'tool',
        status: 'done',
        toolCallId: 'tool-call-1',
        toolName: 'ask_user_question',
        input: {
          question: '请选择渠道',
          mode: 'single',
          options: [{ label: '官网', value: 'official' }]
        },
        result: {
          toolName: 'ask_user_question',
          status: 'awaiting_user_input',
          data: {
            questionId: 'question-1',
            toolCallId: 'tool-call-1',
            mode: 'single',
            question: '请选择渠道',
            options: [{ label: '官网', value: 'official' }]
          }
        }
      }
    ]
  };
}

/**
 * 创建只包含系统错误提示的助手消息。
 * @returns assistant 消息
 */
function createAssistantErrorOnlyMessage(): Message {
  return {
    id: 'assistant-error-1',
    role: 'assistant',
    content: '工具调用轮次超过限制，已停止自动续轮。',
    createdAt: '2026-05-14T00:10:00.000Z',
    finished: true,
    parts: [
      {
        type: 'error',
        text: '工具调用轮次超过限制，已停止自动续轮。'
      }
    ]
  };
}

/**
 * 创建带工具输入预览的助手消息。
 * @returns assistant 消息
 */
function createMessageWithToolInputPreview(): Message {
  return {
    id: 'assistant-tool-input-1',
    role: 'assistant',
    content: '',
    createdAt: '2026-05-14T00:20:00.000Z',
    loading: true,
    finished: false,
    parts: [
      {
        type: 'tool',
        status: 'inputting',
        toolCallId: 'tool-call-1',
        toolName: 'write_file',
        inputText: '{"path":"docs/release-notes.md","content":"# Release"}',
        input: {
          path: 'docs/release-notes.md',
          content: '# Release'
        }
      }
    ]
  };
}

/**
 * 挂载 MessageBubble。
 * @param message - 消息数据
 * @returns 挂载结果
 */
function mountMessageBubble(message: Message): VueWrapper {
  return mount(MessageBubble, {
    props: { message },
    global: {
      stubs: {
        BBubble: BubbleStub,
        BMessage: MessageStub,
        BButton: ButtonStub,
        Icon: IconStub
      }
    }
  });
}

describe('MessageBubble confirmation integration', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = '';
  });

  it('renders confirmation parts inside the message flow', () => {
    const wrapper = mountMessageBubble(createMessageWithConfirmation());

    expect(wrapper.text()).toContain('先看一下变更。');
    expect(wrapper.text()).toContain('AI 想要插入内容');
    expect(wrapper.text()).toContain('AI 请求在当前光标位置插入新内容。');
    expect(wrapper.text()).toContain('应用');
    expect(wrapper.text()).toContain('取消');
  });

  it('re-emits confirmation actions from the embedded confirmation card', async () => {
    const wrapper = mountMessageBubble(createMessageWithConfirmation());
    const buttons = wrapper.findAll('button');

    await buttons[0].trigger('click');
    await buttons[1].trigger('click');

    expect(wrapper.emitted('confirmation-action')).toEqual([
      ['confirmation-1', 'approve'],
      ['confirmation-1', 'cancel']
    ]);
  });

  it('re-emits confirmation-custom-input from the embedded confirmation card', async () => {
    const wrapper = mountMessageBubble(createMessageWithConfirmation());

    await wrapper.get('.confirm-card__custom-trigger button').trigger('click');
    await wrapper.get('.confirm-card__custom-input').setValue('自定义答案');
    await wrapper.get('.confirm-card__custom-submit button').trigger('click');

    expect(wrapper.emitted('confirmation-custom-input')).toEqual([[{ confirmationId: 'confirmation-1', text: '自定义答案' }]]);
  });

  it('renders file-reference parts from structured user message parts', () => {
    const wrapper = mountMessageBubble(createMessageWithFileReferencePart());

    expect(wrapper.text()).toContain('请看');
    expect(wrapper.text()).toContain('foo.ts');
    expect(wrapper.text()).toContain('这里');
  });

  it('renders ask_user_question awaiting results as an interactive choice card', () => {
    const wrapper = mountMessageBubble(createMessageWithAwaitingUserQuestion());

    expect(wrapper.text()).toContain('请选择渠道');
    expect(wrapper.text()).toContain('官网');
    expect(wrapper.text()).toContain('提交选择');
    expect(wrapper.text()).not.toContain('工具结果：ask_user_question');
  });

  it('shows assistant toolbar for finished assistant messages including error-only', () => {
    const wrapper = mountMessageBubble(createAssistantErrorOnlyMessage());

    expect(wrapper.text()).toContain('工具调用轮次超过限制，已停止自动续轮。');
    // Assistant toolbar is shown for all finished assistant messages
    expect(wrapper.find('.message-bubble__toolbar').exists()).toBe(true);
  });

  it('renders streamed write_file preview with path before the final tool-call arrives', () => {
    const wrapper = mountMessageBubble(createMessageWithToolInputPreview());

    expect(wrapper.text()).toContain('准备写入文件');
    expect(wrapper.text()).toContain('docs/release-notes.md');
    expect(wrapper.text()).toContain('# Release');
  });
});
