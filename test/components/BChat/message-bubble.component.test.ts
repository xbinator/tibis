/**
 * @file message-bubble.component.test.ts
 * @description BChat MessageBubble 工具栏交互测试。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
import type { ChatMessageToolPart, ChatMessageWidgetPart, ChatMessageWidgetResultPart } from 'types/chat';
import type { WidgetData, WidgetRenderContext } from 'types/widget';
import { defineComponent } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MessageBubble from '@/components/BChat/components/MessageBubble.vue';
import { create } from '@/components/BChat/utils/messageHelper';
import type { BChatSubmitContext, BChatSubmitAction } from '@/components/BChat/utils/submitAction';
import type { Message } from '@/components/BChat/utils/types';
import { createDefaultWidgetData } from '@/components/BWidget/utils/widgetData';

/** 剪贴板写入测试替身。 */
const clipboardMock = vi.fn();

/**
 * 创建统一提交上下文测试替身。
 * @returns 提交上下文测试替身
 */
function createSubmitContextMock(): BChatSubmitContext {
  return {
    continueAssistantTurn: vi.fn(),
    getMessage: vi.fn(),
    sendAdaptedUserMessage: vi.fn(),
    updateMessage: vi.fn()
  };
}

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
    parts: [{ id: 'part0008', type: 'text', text: 'assistant content' }],
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
          content: '{{ input.city }} 当前 {{ data.weather.temperature }}°C'
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
    data: {
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
    id: 'tool-part-question',
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
        parts: [{ id: 'part0009', type: 'error', text: '模型调用失败' }]
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
      parts: [{ id: 'part0010', type: 'text', text: '内容较少，无需压缩' }],
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
            id: 'part0011',
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
      id: 'widget-render-part',
      type: 'widget',
      sessionId: 'widget-session-1',
      widgetId: 'weather',
      status: 'mounted',
      lifecycle: {},
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

  it('emits unified submit actions after the created widget runs mounted', async (): Promise<void> => {
    const widgetPart: ChatMessageWidgetPart = {
      id: 'widget-created-part',
      type: 'widget',
      sessionId: 'widget-session-1',
      widgetId: 'weather',
      status: 'created',
      lifecycle: {},
      value: {
        ...createWeatherWidgetData(),
        execute: {
          code: ['Widget({', '  mounted() {', "    this.$setData('weather.temperature', 31)", '  }', '})'].join('\n')
        }
      },
      renderContext: {
        input: {
          city: '上海'
        },
        data: {}
      }
    };
    const wrapper = mountMessageBubble(
      createAssistantMessage({
        id: 'assistant-widget',
        content: '',
        parts: [widgetPart]
      })
    );

    await flushPromises();

    const action = wrapper.emitted('submit')?.[0]?.[0] as BChatSubmitAction;
    const submitContext = createSubmitContextMock();
    vi.mocked(submitContext.getMessage).mockReturnValue(
      createAssistantMessage({
        id: 'assistant-widget',
        content: '',
        parts: [widgetPart]
      })
    );
    await action.run(submitContext);

    expect(submitContext.updateMessage).toHaveBeenCalledWith('assistant-widget', expect.any(Function));
    const [, updater] = vi.mocked(submitContext.updateMessage).mock.calls[0];
    const nextMessage = updater(
      createAssistantMessage({
        id: 'assistant-widget',
        content: '',
        parts: [widgetPart]
      })
    );

    expect(nextMessage).toEqual(
      expect.objectContaining({
        id: 'assistant-widget',
        parts: [
          expect.objectContaining({
            status: 'mounted',
            renderContext: {
              input: {
                city: '上海'
              },
              data: {
                weather: {
                  temperature: 31
                }
              }
            }
          })
        ]
      })
    );
  });

  it('emits complete message update actions for widget parts outside the first index', async (): Promise<void> => {
    const widgetPart: ChatMessageWidgetPart = {
      id: 'widget-second-part',
      type: 'widget',
      sessionId: 'widget-session-2',
      widgetId: 'weather',
      status: 'created',
      lifecycle: {},
      value: {
        ...createWeatherWidgetData(),
        execute: {
          code: ['Widget({', '  mounted() {', "    this.$setData('weather.temperature', 32)", '  }', '})'].join('\n')
        }
      },
      renderContext: {
        input: {
          city: '杭州'
        },
        data: {}
      }
    };
    const wrapper = mountMessageBubble(
      createAssistantMessage({
        id: 'assistant-widget-second',
        content: '',
        parts: [{ id: 'part0012', type: 'text', text: '天气卡片' }, widgetPart]
      })
    );

    await flushPromises();

    const action = wrapper.emitted('submit')?.[0]?.[0] as BChatSubmitAction;
    const submitContext = createSubmitContextMock();
    await action.run(submitContext);

    expect(submitContext.updateMessage).toHaveBeenCalledWith('assistant-widget-second', expect.any(Function));
    const [, updater] = vi.mocked(submitContext.updateMessage).mock.calls[0];
    const nextMessage = updater(
      createAssistantMessage({
        id: 'assistant-widget-second',
        content: '',
        parts: [{ id: 'part0013', type: 'text', text: '天气卡片' }, widgetPart]
      })
    );

    expect(nextMessage).toEqual(
      expect.objectContaining({
        id: 'assistant-widget-second',
        parts: [
          expect.objectContaining({ type: 'text', text: '天气卡片' }),
          expect.objectContaining({
            status: 'mounted',
            renderContext: {
              input: {
                city: '杭州'
              },
              data: {
                weather: {
                  temperature: 32
                }
              }
            }
          })
        ]
      })
    );
  });

  it('emits unified submit actions from widget runtime items', async (): Promise<void> => {
    const output: Record<string, unknown> = {
      coffeeId: 'latte',
      size: 'large',
      quantity: 2,
      options: {
        temperature: 'hot'
      }
    };
    const widgetPart: ChatMessageWidgetPart = {
      id: 'widget-result-part',
      type: 'widget',
      sessionId: 'widget-coffee-session-1',
      widgetId: 'coffee',
      status: 'mounted',
      lifecycle: {},
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

    const action = wrapper.emitted('submit')?.[0]?.[0] as BChatSubmitAction;
    const submitContext = createSubmitContextMock();
    vi.mocked(submitContext.getMessage).mockReturnValue(
      createAssistantMessage({
        id: 'assistant-widget-submit',
        content: '',
        parts: [widgetPart]
      })
    );
    await action.run(submitContext);

    expect(submitContext.sendAdaptedUserMessage).toHaveBeenCalledWith({
      userMessage: expect.objectContaining({
        role: 'user',
        content: expect.stringContaining('"type": "widget_result"'),
        parts: [
          expect.objectContaining({
            type: 'widget_result',
            sessionId: 'widget-coffee-session-1',
            widgetId: 'coffee',
            submittedAt: expect.any(String),
            result: {
              status: 'success',
              data: {
                coffeeId: 'latte',
                size: 'large',
                quantity: '2',
                options: '{"temperature":"hot"}'
              }
            }
          })
        ]
      }),
      parts: [
        expect.objectContaining({
          type: 'widget_result',
          sessionId: 'widget-coffee-session-1',
          widgetId: 'coffee',
          submittedAt: expect.any(String),
          result: {
            status: 'success',
            data: {
              coffeeId: 'latte',
              size: 'large',
              quantity: '2',
              options: '{"temperature":"hot"}'
            }
          }
        })
      ],
      errorMessage: '提交小组件结果失败'
    });
  });

  it('finishes widget runtime data before sending widget submit result', async (): Promise<void> => {
    const output: Record<string, unknown> = {
      coffeeId: 'latte'
    };
    const widgetPart: ChatMessageWidgetPart = {
      id: 'widget-submit-part',
      type: 'widget',
      sessionId: 'widget-coffee-session-2',
      widgetId: 'coffee',
      status: 'mounted',
      lifecycle: {
        mountedAt: '2026-07-01T00:00:00.000Z'
      },
      value: {
        ...createWeatherWidgetData(),
        execute: {
          code: [
            'Widget({',
            '  unmounted() {',
            "    this.$setData('submitted', { city: this.$input.city, temperature: this.$data.weather.temperature })",
            '  }',
            '})'
          ].join('\n')
        }
      },
      renderContext: createWeatherRenderContext()
    };
    const wrapper = mountMessageBubble(
      createAssistantMessage({
        id: 'assistant-widget-submit',
        content: '',
        parts: [widgetPart]
      })
    );

    wrapper.findComponent({ name: 'BWidgetRuntime' }).vm.$emit('submit', output);

    const action = wrapper.emitted('submit')?.[0]?.[0] as BChatSubmitAction;
    const submitContext = createSubmitContextMock();
    vi.mocked(submitContext.getMessage).mockReturnValue(
      createAssistantMessage({
        id: 'assistant-widget-submit',
        content: '',
        parts: [widgetPart]
      })
    );
    await action.run(submitContext);

    expect(submitContext.updateMessage).toHaveBeenCalledWith('assistant-widget-submit', expect.any(Function));
    const [, updater] = vi.mocked(submitContext.updateMessage).mock.calls[0];
    const nextMessage = updater(
      createAssistantMessage({
        id: 'assistant-widget-submit',
        content: '',
        parts: [widgetPart]
      })
    );

    expect(nextMessage.parts[0]).toMatchObject({
      status: 'finished',
      lifecycle: {
        mountedAt: '2026-07-01T00:00:00.000Z',
        unmountedAt: expect.any(String)
      },
      renderContext: {
        data: {
          weather: {
            temperature: 28
          },
          submitted: {
            city: '上海',
            temperature: 28
          }
        }
      }
    });
    expect(submitContext.sendAdaptedUserMessage).toHaveBeenCalledTimes(1);
  });

  it('finishes widget runtime data from the latest message part', async (): Promise<void> => {
    const staleWidgetPart: ChatMessageWidgetPart = {
      id: 'widget-latest-submit-part',
      type: 'widget',
      sessionId: 'widget-coffee-session-3',
      widgetId: 'coffee',
      status: 'mounted',
      lifecycle: {
        mountedAt: '2026-07-01T00:00:00.000Z'
      },
      value: {
        ...createWeatherWidgetData(),
        execute: {
          code: ['Widget({', '  unmounted() {', "    this.$setData('submitted.temperature', this.$data.weather.temperature)", '  }', '})'].join('\n')
        }
      },
      renderContext: createWeatherRenderContext()
    };
    const latestWidgetPart: ChatMessageWidgetPart = {
      ...staleWidgetPart,
      renderContext: {
        input: {
          city: '上海'
        },
        data: {
          weather: {
            temperature: 35
          }
        }
      }
    };
    const wrapper = mountMessageBubble(
      createAssistantMessage({
        id: 'assistant-widget-latest-submit',
        content: '',
        parts: [staleWidgetPart]
      })
    );

    wrapper.findComponent({ name: 'BWidgetRuntime' }).vm.$emit('submit', { coffeeId: 'latte' });

    const action = wrapper.emitted('submit')?.[0]?.[0] as BChatSubmitAction;
    const submitContext = createSubmitContextMock();
    vi.mocked(submitContext.getMessage).mockReturnValue(
      createAssistantMessage({
        id: 'assistant-widget-latest-submit',
        content: '',
        parts: [latestWidgetPart]
      })
    );
    await action.run(submitContext);

    const [, updater] = vi.mocked(submitContext.updateMessage).mock.calls[0];
    const nextMessage = updater(
      createAssistantMessage({
        id: 'assistant-widget-latest-submit',
        content: '',
        parts: [latestWidgetPart]
      })
    );

    expect(nextMessage.parts[0]).toMatchObject({
      status: 'finished',
      renderContext: {
        data: {
          weather: {
            temperature: 35
          },
          submitted: {
            temperature: 35
          }
        }
      }
    });
  });

  it('adds ids to widget script message parts and sends them instead of widget_result', async (): Promise<void> => {
    const widgetPart: ChatMessageWidgetPart = {
      id: 'widget-send-message-part',
      type: 'widget',
      sessionId: 'widget-coffee-session-4',
      widgetId: 'coffee',
      status: 'mounted',
      lifecycle: {
        mountedAt: '2026-07-01T00:00:00.000Z'
      },
      value: {
        ...createWeatherWidgetData(),
        execute: {
          code: ['Widget({', '  unmounted() {', "    this.$sendMessage({ content: [{ type: 'text', text: '确认下单' }] })", '  }', '})'].join('\n')
        }
      },
      renderContext: createWeatherRenderContext()
    };
    const wrapper = mountMessageBubble(
      createAssistantMessage({
        id: 'assistant-widget-send-message',
        content: '',
        parts: [widgetPart]
      })
    );

    wrapper.findComponent({ name: 'BWidgetRuntime' }).vm.$emit('submit', { coffeeId: 'latte' });

    const action = wrapper.emitted('submit')?.[0]?.[0] as BChatSubmitAction;
    const submitContext = createSubmitContextMock();
    vi.mocked(submitContext.getMessage).mockReturnValue(
      createAssistantMessage({
        id: 'assistant-widget-send-message',
        content: '',
        parts: [widgetPart]
      })
    );
    vi.mocked(submitContext.updateMessage).mockImplementation(async (_messageId, updater): Promise<void> => {
      updater(
        createAssistantMessage({
          id: 'assistant-widget-send-message',
          content: '',
          parts: [widgetPart]
        })
      );
    });
    await action.run(submitContext);

    expect(submitContext.sendAdaptedUserMessage).toHaveBeenCalledWith({
      userMessage: expect.objectContaining({
        role: 'user',
        content: '确认下单',
        parts: [expect.objectContaining({ id: expect.any(String), type: 'text', text: '确认下单' })]
      }),
      parts: [expect.objectContaining({ id: expect.any(String), type: 'text', text: '确认下单' })],
      errorMessage: '发送小组件消息失败'
    });
    expect(submitContext.sendAdaptedUserMessage).toHaveBeenCalledTimes(1);
  });

  it('marks widget script error messages in the text sent to chat runtime', async (): Promise<void> => {
    const widgetPart: ChatMessageWidgetPart = {
      id: 'widget-error-message-part',
      type: 'widget',
      sessionId: 'widget-coffee-session-error',
      widgetId: 'coffee',
      status: 'mounted',
      lifecycle: {
        mountedAt: '2026-07-01T00:00:00.000Z'
      },
      value: {
        ...createWeatherWidgetData(),
        execute: {
          code: ['Widget({', '  unmounted() {', "    this.$sendMessage({ content: '库存不足', isError: true })", '  }', '})'].join('\n')
        }
      },
      renderContext: createWeatherRenderContext()
    };
    const message = createAssistantMessage({
      id: 'assistant-widget-error-message',
      content: '',
      parts: [widgetPart]
    });
    const wrapper = mountMessageBubble(message);

    wrapper.findComponent({ name: 'BWidgetRuntime' }).vm.$emit('submit', { coffeeId: 'latte' });

    const action = wrapper.emitted('submit')?.[0]?.[0] as BChatSubmitAction;
    const submitContext = createSubmitContextMock();
    vi.mocked(submitContext.getMessage).mockReturnValue(message);
    await action.run(submitContext);

    expect(submitContext.sendAdaptedUserMessage).toHaveBeenCalledWith({
      userMessage: expect.objectContaining({
        role: 'user',
        content: '小组件错误：库存不足',
        parts: [expect.objectContaining({ type: 'text', text: '小组件错误：库存不足' })]
      }),
      parts: [expect.objectContaining({ type: 'text', text: '小组件错误：库存不足' })],
      errorMessage: '发送小组件消息失败'
    });
  });

  it('sends widget script message from latest message without relying on update updater side effects', async (): Promise<void> => {
    const staleWidgetPart: ChatMessageWidgetPart = {
      id: 'widget-latest-message-part',
      type: 'widget',
      sessionId: 'widget-coffee-session-latest-message',
      widgetId: 'coffee',
      status: 'mounted',
      lifecycle: {
        mountedAt: '2026-07-01T00:00:00.000Z'
      },
      value: {
        ...createWeatherWidgetData(),
        execute: {
          code: ['Widget({', '  unmounted() {', '    this.$sendMessage({ content: this.$data.order.message })', '  }', '})'].join('\n')
        }
      },
      renderContext: createWeatherRenderContext()
    };
    const latestWidgetPart: ChatMessageWidgetPart = {
      ...staleWidgetPart,
      renderContext: {
        input: {},
        data: {
          order: {
            message: '确认最新订单'
          }
        }
      }
    };
    const wrapper = mountMessageBubble(
      createAssistantMessage({
        id: 'assistant-widget-latest-message',
        content: '',
        parts: [staleWidgetPart]
      })
    );

    wrapper.findComponent({ name: 'BWidgetRuntime' }).vm.$emit('submit', { coffeeId: 'latte' });

    const action = wrapper.emitted('submit')?.[0]?.[0] as BChatSubmitAction;
    const submitContext = createSubmitContextMock();
    vi.mocked(submitContext.getMessage).mockReturnValue(
      createAssistantMessage({
        id: 'assistant-widget-latest-message',
        content: '',
        parts: [latestWidgetPart]
      })
    );
    await action.run(submitContext);

    expect(submitContext.sendAdaptedUserMessage).toHaveBeenCalledWith({
      userMessage: expect.objectContaining({
        role: 'user',
        content: '确认最新订单',
        parts: [expect.objectContaining({ type: 'text', text: '确认最新订单' })]
      }),
      parts: [expect.objectContaining({ type: 'text', text: '确认最新订单' })],
      errorMessage: '发送小组件消息失败'
    });
  });

  it('emits unified submit actions from question answers', async (): Promise<void> => {
    const wrapper = mountMessageBubble(
      createAssistantMessage({
        content: '',
        parts: [createQuestionToolPart()]
      })
    );

    await wrapper.get('.choice-card__option-btn').trigger('click');
    await wrapper.get('.choice-card__footer-right .b-button-stub:last-child').trigger('click');
    await wrapper.get('.choice-card__footer-right .b-button-stub:last-child').trigger('click');

    const action = wrapper.emitted('submit')?.[0]?.[0] as BChatSubmitAction;
    const submitContext = createSubmitContextMock();
    await action.run(submitContext);

    expect(submitContext.continueAssistantTurn).toHaveBeenCalledWith({
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
    });
  });

  it('renders open_widget tool results as widget runtime items', (): void => {
    const toolPart: ChatMessageToolPart = {
      id: 'part0014',
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

  it('emits message update actions to keep open_widget runtime on the tool part', async (): Promise<void> => {
    const toolPart: ChatMessageToolPart = {
      id: 'part0014',
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
    const message = createAssistantMessage({
      id: 'assistant-open-widget',
      content: '',
      parts: [toolPart]
    });
    const wrapper = mountMessageBubble(message);

    await flushPromises();

    const action = wrapper.emitted('submit')?.[0]?.[0] as BChatSubmitAction;
    const submitContext = createSubmitContextMock();
    await action.run(submitContext);

    expect(submitContext.updateMessage).toHaveBeenCalledWith('assistant-open-widget', expect.any(Function));
    const [, updater] = vi.mocked(submitContext.updateMessage).mock.calls[0];
    const nextMessage = updater(message);

    expect(nextMessage.parts).toEqual([
      expect.objectContaining({
        ...toolPart,
        widget: expect.objectContaining({
          sessionId: 'widget-weather-tool-call-widget',
          widgetId: 'weather',
          status: 'created'
        })
      })
    ]);

    await wrapper.setProps({ message: nextMessage });
    await flushPromises();

    const mountedAction = wrapper.emitted('submit')?.[1]?.[0] as BChatSubmitAction;
    const mountedSubmitContext = createSubmitContextMock();
    await mountedAction.run(mountedSubmitContext);

    expect(mountedSubmitContext.updateMessage).toHaveBeenCalledWith('assistant-open-widget', expect.any(Function));
    const [, mountedUpdater] = vi.mocked(mountedSubmitContext.updateMessage).mock.calls[0];

    expect(mountedUpdater(nextMessage).parts[0]).toEqual(
      expect.objectContaining({
        type: 'tool',
        widget: expect.objectContaining({
          status: 'mounted',
          lifecycle: expect.objectContaining({
            mountedAt: expect.any(String)
          })
        })
      })
    );
  });

  it('copies user widget result messages from message content when no text part exists', async (): Promise<void> => {
    const widgetResultPart: ChatMessageWidgetResultPart = {
      id: 'part0015',
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
