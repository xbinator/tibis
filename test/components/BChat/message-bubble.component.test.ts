/**
 * @file message-bubble.component.test.ts
 * @description BChat MessageBubble 工具栏交互测试。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
import type { ChatMessageToolPart, ChatMessageWidgetPart, ChatMessageWidgetResultPart } from 'types/chat';
import { defineComponent } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MessageBubble from '@/components/BChat/components/MessageBubble.vue';
import { create } from '@/components/BChat/utils/messageHelper';
import type { Message } from '@/components/BChat/utils/types';
import type { WidgetData, WidgetRenderContext } from '@/components/BWidget/types';
import { createDefaultWidgetData } from '@/components/BWidget/utils/widgetData';

/** 剪贴板写入测试替身。 */
const clipboardMock = vi.fn();

vi.mock('@/hooks/useClipboard', () => ({
  useClipboard: vi.fn(() => ({
    clipboard: clipboardMock
  }))
}));

vi.mock('@/hooks/useImagePreview', () => ({
  useImagePreview: vi.fn(() => ({
    previewImage: vi.fn()
  }))
}));

vi.mock('@/hooks/useNavigate', () => ({
  useNavigate: vi.fn(() => ({
    openFile: vi.fn(),
    openWebview: vi.fn()
  }))
}));

/** ResizeObserver 回调。 */
type ResizeObserverCallbackLike = (entries: ResizeObserverEntry[]) => void;

/**
 * BWidgetRuntime 测试用 ResizeObserver。
 */
class ResizeObserverMock {
  /** ResizeObserver 回调。 */
  private readonly callback: ResizeObserverCallbackLike;

  /**
   * 创建 ResizeObserver 测试替身。
   * @param callback - ResizeObserver 回调
   */
  public constructor(callback: ResizeObserverCallbackLike) {
    this.callback = callback;
  }

  /**
   * 监听目标元素尺寸。
   * @param target - 监听目标
   */
  public observe = (target: Element): void => {
    this.callback([
      {
        target,
        contentRect: DOMRect.fromRect({ width: 480, height: 240 }),
        contentBoxSize: [
          {
            inlineSize: 480,
            blockSize: 240
          }
        ]
      } as unknown as ResizeObserverEntry
    ]);
  };

  /** 停止监听目标元素。 */
  public unobserve = vi.fn();

  /** 断开全部尺寸监听。 */
  public disconnect = vi.fn();
}

/** BBubble 测试替身，保留默认插槽用于渲染消息内容。 */
const BBubbleStub = defineComponent({
  name: 'BBubble',
  template: '<div class="b-bubble-stub"><slot name="header" /><slot /></div>'
});

/** BButton 测试替身，暴露 icon 属性便于断言按钮是否存在。 */
const BButtonStub = defineComponent({
  name: 'BButton',
  props: {
    icon: {
      type: String,
      default: ''
    },
    disabled: {
      type: Boolean,
      default: false
    }
  },
  emits: ['click'],
  template: '<button class="b-button-stub" :data-icon="icon" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>'
});

/** Markdown 消息测试替身，直接渲染文本内容。 */
const BMessageStub = defineComponent({
  name: 'BMessage',
  props: {
    content: {
      type: String,
      default: ''
    }
  },
  template: '<div class="b-message-stub">{{ content }}</div>'
});

/**
 * 创建助手消息。
 * @param overrides - 消息覆盖字段
 * @returns 助手消息
 */
function createAssistantMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: 'assistant content',
    parts: [{ type: 'text', text: 'assistant content' }],
    createdAt: '2026-06-23T00:00:00.000Z',
    loading: false,
    finished: true,
    ...overrides
  };
}

/**
 * 创建消息内小组件快照数据。
 * @returns 小组件快照数据
 */
function createWeatherWidgetData(): WidgetData {
  return {
    ...createDefaultWidgetData(),
    elements: [
      {
        id: 'weather-text',
        name: 'text',
        label: '文本',
        icon: 'lucide:type',
        title: '天气文本',
        position: { x: 0, y: 0 },
        size: { width: 180, height: 48 },
        rotation: 0,
        style: {},
        metadata: {
          content: '{{ input.city }} 当前 {{ state.weather.temperature }}°C'
        }
      }
    ],
    viewport: {
      center: { x: 0, y: 0 },
      zoom: 1
    }
  };
}

/**
 * 创建消息内小组件渲染上下文。
 * @returns 小组件渲染上下文
 */
function createWeatherRenderContext(): WidgetRenderContext {
  return {
    input: {
      city: '上海'
    },
    state: {
      weather: {
        temperature: 28
      }
    }
  };
}

/**
 * 创建等待用户选择的工具片段。
 * @returns 等待用户选择工具片段
 */
function createQuestionToolPart(): ChatMessageToolPart {
  return {
    type: 'tool',
    toolCallId: 'tool-call-question',
    toolName: 'question',
    status: 'done',
    input: {},
    result: {
      toolName: 'question',
      status: 'awaiting_user_input',
      data: {
        questionId: 'question-1',
        toolCallId: 'tool-call-question',
        question: '是否继续？',
        mode: 'single',
        options: [{ label: '继续', value: 'continue' }]
      }
    }
  };
}

/**
 * 挂载消息气泡。
 * @param message - 待渲染消息
 * @returns 组件包装器
 */
function mountMessageBubble(message: Message): VueWrapper {
  return mount(MessageBubble, {
    props: { message },
    global: {
      stubs: {
        BBubble: BBubbleStub,
        BButton: BButtonStub,
        BIcon: true,
        BRecentIcon: true,
        BMessage: BMessageStub
      }
    }
  });
}

describe('MessageBubble', (): void => {
  beforeEach((): void => {
    clipboardMock.mockClear();
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback): number => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach((): void => {
    vi.unstubAllGlobals();
  });

  it('shows regenerate for finished assistant text messages', (): void => {
    const wrapper = mountMessageBubble(createAssistantMessage());

    expect(wrapper.find('[data-icon="lucide:refresh-cw"]').exists()).toBe(true);
  });

  it('does not show regenerate for runtime error messages', (): void => {
    const wrapper = mountMessageBubble(create.errorMessage('模型调用失败'));

    expect(wrapper.find('[data-icon="lucide:refresh-cw"]').exists()).toBe(false);
    expect(wrapper.emitted('regenerate')).toBeUndefined();
  });

  it('shows regenerate for assistant messages that contain an error part', async (): Promise<void> => {
    const wrapper = mountMessageBubble(
      createAssistantMessage({
        content: '模型调用失败',
        parts: [{ type: 'error', text: '模型调用失败' }]
      })
    );

    const regenerateButton = wrapper.get('[data-icon="lucide:refresh-cw"]');
    await regenerateButton.trigger('click');

    expect(wrapper.emitted('regenerate')?.[0]?.[0]).toMatchObject({
      role: 'assistant',
      content: '模型调用失败'
    });
  });

  it('shows skipped compression messages as a friendly neutral notice', (): void => {
    const wrapper = mountMessageBubble({
      id: 'compression-skipped-1',
      role: 'compression',
      content: '内容较少，无需压缩',
      parts: [{ type: 'text', text: '内容较少，无需压缩' }],
      createdAt: '2026-06-23T00:00:00.000Z',
      loading: false,
      finished: true,
      compression: {
        status: 'skipped',
        recordText: '内容较少，无需压缩'
      }
    });

    expect(wrapper.text()).toContain('无需压缩');
    expect(wrapper.text()).not.toContain('上下文已压缩');
    expect(wrapper.text()).not.toContain('压缩失败');
    expect(wrapper.find('.status-node__error').exists()).toBe(false);
  });

  it('renders assistant compaction parts as inline compression status', (): void => {
    const wrapper = mountMessageBubble(
      createAssistantMessage({
        content: '',
        parts: [
          {
            type: 'compaction',
            auto: true,
            reason: 'auto',
            status: 'success',
            recordId: 'record-1',
            recordText: 'COMPRESSED_CONTEXT',
            coveredUntilMessageId: 'assistant-previous'
          }
        ]
      })
    );

    expect(wrapper.text()).toContain('上下文已压缩');
    expect(wrapper.text()).not.toContain('压缩失败');
  });

  it('renders widget parts with runtime template variables inside assistant bubbles', (): void => {
    const widgetPart: ChatMessageWidgetPart = {
      type: 'widget',
      sessionId: 'widget-session-1',
      widgetId: 'weather',
      status: 'success',
      value: createWeatherWidgetData(),
      renderContext: createWeatherRenderContext()
    } as ChatMessageWidgetPart;
    const wrapper = mountMessageBubble(
      createAssistantMessage({
        content: '',
        parts: [widgetPart]
      })
    );

    expect(wrapper.text()).toContain('上海');
    expect(wrapper.text()).toContain('28°C');
  });

  it('emits runtime input payloads from widget runtime items', async (): Promise<void> => {
    const output: Record<string, unknown> = {
      coffeeId: 'latte',
      size: 'large',
      quantity: 2,
      options: {
        temperature: 'hot'
      }
    };
    const widgetPart: ChatMessageWidgetPart = {
      type: 'widget',
      sessionId: 'widget-coffee-session-1',
      widgetId: 'coffee',
      status: 'success',
      value: createWeatherWidgetData(),
      renderContext: createWeatherRenderContext()
    } as ChatMessageWidgetPart;
    const wrapper = mountMessageBubble(
      createAssistantMessage({
        content: '',
        parts: [widgetPart]
      })
    );

    wrapper.findComponent({ name: 'BWidgetRuntime' }).vm.$emit('submit', output);

    expect(wrapper.emitted('runtime-input')?.[0]).toEqual([
      {
        kind: 'widget_result',
        sessionId: 'widget-coffee-session-1',
        widgetId: 'coffee',
        result: {
          status: 'success',
          data: {
            coffeeId: 'latte',
            size: 'large',
            quantity: '2',
            options: '{"temperature":"hot"}'
          }
        }
      }
    ]);
  });

  it('emits runtime input payloads from question answers', async (): Promise<void> => {
    const wrapper = mountMessageBubble(
      createAssistantMessage({
        content: '',
        parts: [createQuestionToolPart()]
      })
    );

    await wrapper.get('.choice-card__option-btn').trigger('click');
    await wrapper.get('.choice-card__footer-right .b-button-stub:last-child').trigger('click');
    await wrapper.get('.choice-card__footer-right .b-button-stub:last-child').trigger('click');

    expect(wrapper.emitted('runtime-input')?.[0]).toEqual([
      {
        kind: 'user_choice',
        answer: {
          questionId: 'question-1',
          toolCallId: 'tool-call-question',
          answers: ['continue'],
          questionAnswers: [
            {
              question: '是否继续？',
              answers: ['continue']
            }
          ],
          otherText: ''
        }
      }
    ]);
  });

  it('renders open_widget tool results as widget runtime items', (): void => {
    const toolPart: ChatMessageToolPart = {
      type: 'tool',
      toolCallId: 'tool-call-widget',
      toolName: 'open_widget',
      status: 'done',
      input: {
        id: 'weather',
        input: {
          city: '上海'
        }
      },
      result: {
        toolName: 'open_widget',
        status: 'success',
        data: {
          kind: 'widget_display',
          sessionId: 'widget-weather-tool-call-widget',
          widgetId: 'weather',
          value: createWeatherWidgetData(),
          renderContext: createWeatherRenderContext()
        }
      }
    };
    const wrapper = mountMessageBubble(
      createAssistantMessage({
        content: '',
        parts: [toolPart]
      })
    );

    expect(wrapper.text()).toContain('上海');
    expect(wrapper.text()).toContain('28°C');
  });

  it('copies user widget result messages from message content when no text part exists', async (): Promise<void> => {
    const widgetResultPart: ChatMessageWidgetResultPart = {
      type: 'widget_result',
      sessionId: 'widget-session-1',
      widgetId: 'weather',
      submittedAt: '2026-06-30T00:00:00.000Z',
      result: {
        status: 'success',
        data: {
          city: '上海',
          action: 'confirm'
        }
      }
    };
    const content = '小组件已提交：{"city":"上海","action":"confirm"}';
    const wrapper = mountMessageBubble({
      id: 'user-widget-result-1',
      role: 'user',
      content,
      parts: [widgetResultPart],
      createdAt: '2026-06-30T00:00:00.000Z',
      loading: false,
      finished: true
    });

    await wrapper.get('[data-icon="lucide:copy"]').trigger('click');

    expect(clipboardMock).toHaveBeenCalledWith(content, { successMessage: '已复制到剪贴板' });
  });
});
