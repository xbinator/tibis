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
        type: 'tool-call',
        toolCallId: 'tool-call-1',
        toolName: 'ask_user_question',
        input: {
          question: '请选择渠道',
          mode: 'single',
          options: [{ label: '官网', value: 'official' }]
        }
      },
      {
        type: 'tool-result',
        toolCallId: 'tool-call-1',
        toolName: 'ask_user_question',
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
        type: 'tool-input',
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
 * 创建带完整工具调用结果的助手消息。
 * @returns assistant 消息
 */
function createMessageWithToolResult(): Message {
  return {
    id: 'assistant-tool-result-1',
    role: 'assistant',
    content: '',
    createdAt: '2026-05-14T00:25:00.000Z',
    loading: false,
    finished: true,
    parts: [
      {
        type: 'tool-call',
        toolCallId: 'tool-call-1',
        toolName: 'write_file',
        input: {
          path: 'docs/release-notes.md',
          content: '# Release'
        }
      },
      {
        type: 'tool-result',
        toolCallId: 'tool-call-1',
        toolName: 'write_file',
        result: {
          toolName: 'write_file',
          status: 'success',
          data: {
            path: 'docs/release-notes.md',
            bytes: 9
          }
        }
      }
    ]
  };
}

/**
 * 创建指定工具名称的成功结果消息。
 * @param toolName - 工具名称
 * @returns assistant 消息
 */
function createMessageWithNamedToolResult(toolName: string): Message {
  return {
    id: `assistant-tool-result-${toolName}`,
    role: 'assistant',
    content: '',
    createdAt: '2026-05-14T00:30:00.000Z',
    loading: false,
    finished: true,
    parts: [
      {
        type: 'tool-result',
        toolCallId: `tool-call-${toolName}`,
        toolName,
        result: {
          toolName,
          status: 'success',
          data: {}
        }
      }
    ]
  };
}

/**
 * 创建已完成的用户提问工具消息。
 * @returns assistant 消息
 */
function createMessageWithCompletedQuestionTool(): Message {
  return {
    id: 'assistant-question-complete-1',
    role: 'assistant',
    content: '',
    createdAt: '2026-05-14T00:35:00.000Z',
    loading: false,
    finished: true,
    parts: [
      {
        type: 'tool-result',
        toolCallId: 'tool-call-question-1',
        toolName: 'question',
        result: {
          toolName: 'question',
          status: 'success',
          data: {
            questionId: 'question-1',
            toolCallId: 'tool-call-question-1',
            answers: ['official'],
            questionAnswers: [
              {
                question: '请选择渠道',
                answers: ['official']
              }
            ],
            otherText: '优先官网'
          }
        }
      }
    ]
  };
}

/**
 * 创建旧格式的单题用户提问工具完成消息。
 * @returns assistant 消息
 */
function createMessageWithLegacyCompletedQuestionTool(): Message {
  return {
    id: 'assistant-question-legacy-complete-1',
    role: 'assistant',
    content: '',
    createdAt: '2026-05-14T00:40:00.000Z',
    loading: false,
    finished: true,
    parts: [
      {
        type: 'tool-call',
        toolCallId: 'tool-call-question-legacy-1',
        toolName: 'ask_user_question',
        input: {
          question: '请选择发布渠道',
          mode: 'single',
          options: [{ label: '官网', value: 'official' }]
        }
      },
      {
        type: 'tool-result',
        toolCallId: 'tool-call-question-legacy-1',
        toolName: 'ask_user_question',
        result: {
          toolName: 'ask_user_question',
          status: 'success',
          data: {
            questionId: 'question-legacy-1',
            toolCallId: 'tool-call-question-legacy-1',
            answers: ['official'],
            otherText: ''
          }
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
    expect(wrapper.text()).toContain('提交');
    expect(wrapper.text()).not.toContain('调用工具：ask_user_question');
    expect(wrapper.text()).not.toContain('工具结果：ask_user_question');
  });

  it('shows assistant toolbar for finished assistant messages including error-only', () => {
    const wrapper = mountMessageBubble(createAssistantErrorOnlyMessage());

    expect(wrapper.text()).toContain('工具调用轮次超过限制，已停止自动续轮。');
    // Assistant toolbar is shown for all finished assistant messages
    expect(wrapper.find('.message-bubble__toolbar').exists()).toBe(true);
  });

  it('renders streamed tool work as a user-facing progress summary', () => {
    const wrapper = mountMessageBubble(createMessageWithToolInputPreview());

    expect(wrapper.text()).toContain('文件写入：正在写入文件');
    expect(wrapper.text()).toContain('正在写入文件');
    expect(wrapper.text()).not.toContain('write_file');
    expect(wrapper.text()).not.toContain('docs/release-notes.md');
    expect(wrapper.text()).not.toContain('# Release');
  });

  it('renders completed tool work as a concise result without exposing tool details', () => {
    const wrapper = mountMessageBubble(createMessageWithToolResult());

    expect(wrapper.text()).toContain('文件写入：文件写入完成');
    expect(wrapper.text()).toContain('文件写入完成');
    expect(wrapper.text()).not.toContain('已完成已完成');
    expect(wrapper.text()).not.toContain('write_file');
    expect(wrapper.text()).not.toContain('docs/release-notes.md');
    expect(wrapper.text()).not.toContain('# Release');
  });

  it.each([
    ['read_directory', '目录读取：目录读取完成'],
    ['get_current_time', '时间获取：时间获取完成'],
    ['skill', 'Skill 加载：Skill 加载完成'],
    ['refresh_mcp_discovery', 'MCP 发现刷新：MCP 发现刷新完成'],
    ['tavily_extract', '网页提取：网页内容提取完成']
  ])('renders %s with a user-facing alias', (toolName: string, expectedText: string) => {
    const wrapper = mountMessageBubble(createMessageWithNamedToolResult(toolName));

    expect(wrapper.text()).toContain(expectedText);
    expect(wrapper.text()).not.toContain(toolName);
  });

  it('renders completed question tool with question and submitted answer', () => {
    const wrapper = mountMessageBubble(createMessageWithCompletedQuestionTool());

    expect(wrapper.text()).toContain('提问：问题已提交');
    expect(wrapper.text()).toContain('问题：请选择渠道');
    expect(wrapper.text()).toContain('回答：official');
    expect(wrapper.text()).toContain('补充：优先官网');
    expect(wrapper.text()).not.toContain('tool-call-question-1');
  });

  it('renders legacy single-question result with question from the tool call input', () => {
    const wrapper = mountMessageBubble(createMessageWithLegacyCompletedQuestionTool());

    expect(wrapper.text()).toContain('提问：问题已提交');
    expect(wrapper.text()).toContain('问题：请选择发布渠道');
    expect(wrapper.text()).toContain('回答：official');
    expect(wrapper.text()).not.toContain('ask_user_question');
  });
});
