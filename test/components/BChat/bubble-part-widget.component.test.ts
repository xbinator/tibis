/**
 * @file bubble-part-widget.component.test.ts
 * @description BChat BubblePartWidget 小组件运行态提交测试。
 * @vitest-environment jsdom
 */
import type { ChatMessageToolPart, ChatMessageWidgetPart } from 'types/chat';
import type { WidgetData, WidgetRenderContext, WidgetRuntimeChange } from 'types/widget';
import { defineComponent, nextTick } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import BubblePartWidget from '@/components/BChat/components/MessageBubble/BubblePartWidget/index.vue';
import type { BChatSubmitAction, BChatSubmitContext } from '@/components/BChat/utils/submitAction';
import type { Message } from '@/components/BChat/utils/types';
import { createDefaultWidgetData } from '@/components/BWidget/utils/widgetData';

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

/**
 * 创建助手消息。
 * @param overrides - 消息覆盖字段
 * @returns 助手消息
 */
function createAssistantMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'assistant-widget-message',
    role: 'assistant',
    content: '',
    parts: [],
    createdAt: '2026-07-01T00:00:00.000Z',
    loading: false,
    finished: true,
    ...overrides
  };
}

/**
 * 创建消息内小组件快照数据。
 * @param code - 小组件JS 脚本
 * @returns 小组件快照数据
 */
function createWidgetData(code: string): WidgetData {
  return {
    ...createDefaultWidgetData(),
    execute: {
      code
    }
  };
}

/**
 * 创建消息内小组件渲染上下文。
 * @returns 小组件渲染上下文
 */
function createWidgetRenderContext(): WidgetRenderContext {
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
 * 创建小组件消息片段。
 * @param code - 小组件JS 脚本
 * @returns 小组件消息片段
 */
function createWidgetPart(code: string): ChatMessageWidgetPart {
  return {
    id: `widget-part-${code.length}`,
    type: 'widget',
    sessionId: 'widget-coffee-session',
    widgetId: 'coffee',
    status: 'mounted',
    lifecycle: {
      mountedAt: '2026-07-01T00:00:00.000Z'
    },
    value: createWidgetData(code),
    renderContext: createWidgetRenderContext()
  };
}

/**
 * 从小组件视图片段创建 open_widget 工具片段。
 * @param part - 小组件视图片段
 * @returns 承载小组件运行态的工具消息片段
 */
function createOpenWidgetToolPartFromWidgetPart(part: ChatMessageWidgetPart): ChatMessageToolPart {
  return {
    id: part.id,
    type: 'tool',
    toolCallId: `tool-call-${part.id}`,
    toolName: 'open_widget',
    status: 'done',
    presentation: 'widget',
    input: {
      id: part.widgetId
    },
    result: {
      toolName: 'open_widget',
      status: 'success',
      data: {
        kind: 'widget_display',
        sessionId: part.sessionId,
        widgetId: part.widgetId,
        value: part.value,
        renderContext: part.renderContext
      }
    },
    widget: {
      sessionId: part.sessionId,
      widgetId: part.widgetId,
      status: part.status,
      lifecycle: part.lifecycle,
      value: part.value,
      renderContext: part.renderContext
    }
  };
}

/**
 * 创建 BWidgetRuntime 运行态变化事件。
 * @param part - 来源小组件片段
 * @param change - 运行态变化覆盖字段
 * @returns 运行态变化事件
 */
function createRuntimeChange(part: ChatMessageWidgetPart, change: Partial<WidgetRuntimeChange> = {}): WidgetRuntimeChange {
  return {
    reason: 'mount',
    value: part.value,
    status: part.status,
    lifecycle: part.lifecycle,
    renderContext: part.renderContext,
    ...change
  };
}

/** BWidgetRuntime 测试替身。 */
const BWidgetRuntimeStub = defineComponent({
  name: 'BWidgetRuntime',
  props: {
    lifecycle: {
      type: Object,
      default: () => ({})
    },
    renderContext: {
      type: Object,
      required: true
    },
    runtimeEnabled: {
      type: Boolean,
      default: false
    },
    status: {
      type: String,
      default: 'created'
    },
    value: {
      type: Object,
      required: true
    }
  },
  emits: ['change', 'submit'],
  template: '<button class="widget-submit" type="button" @click="$emit(\'submit\', { coffeeId: \'latte\' })">提交</button>'
});

/**
 * 挂载小组件工具片段。
 * @param part - open_widget 工具片段
 * @param props - 额外组件入参
 * @returns 组件包装器
 */
function mountBubblePartWidget(part: ChatMessageToolPart, props: Record<string, unknown> = {}): VueWrapper {
  return mount(BubblePartWidget, {
    props: {
      part,
      ...props
    },
    global: {
      stubs: {
        BWidgetRuntime: BWidgetRuntimeStub
      }
    }
  });
}

describe('BubblePartWidget', (): void => {
  it('renders widget runtime data from main-initialized open_widget tool parts', (): void => {
    const widgetValue = createWidgetData('export default class Weather extends Widget {}');
    const renderContext = createWidgetRenderContext();
    const toolPart: ChatMessageToolPart = {
      id: 'tool-open-widget',
      type: 'tool',
      toolCallId: 'tool-call-widget',
      toolName: 'open_widget',
      status: 'done',
      presentation: 'widget',
      input: {
        id: 'coffee'
      },
      result: {
        toolName: 'open_widget',
        status: 'success',
        data: {
          kind: 'widget_display',
          sessionId: 'widget-coffee-session',
          widgetId: 'coffee',
          value: widgetValue,
          renderContext
        }
      },
      widget: {
        sessionId: 'widget-coffee-session',
        widgetId: 'coffee',
        status: 'created',
        lifecycle: {},
        value: widgetValue,
        renderContext
      }
    };
    const wrapper = mountBubblePartWidget(toolPart, {
      message: createAssistantMessage({ id: 'assistant-widget-message', parts: [toolPart] })
    });

    expect(wrapper.findComponent({ name: 'BWidgetRuntime' }).props()).toMatchObject({
      lifecycle: {},
      renderContext,
      runtimeEnabled: true,
      status: 'created',
      value: widgetValue
    });
  });

  it('emits changed widget parts when the runtime view reports mounted data', async (): Promise<void> => {
    const widgetPart: ChatMessageWidgetPart = {
      ...createWidgetPart('export default class Weather extends Widget {}'),
      status: 'created',
      lifecycle: {},
      renderContext: {
        input: {
          city: '上海'
        },
        data: {}
      }
    };

    const wrapper = mountBubblePartWidget(createOpenWidgetToolPartFromWidgetPart(widgetPart));
    wrapper.findComponent({ name: 'BWidgetRuntime' }).vm.$emit(
      'change',
      createRuntimeChange(widgetPart, {
        reason: 'mount',
        status: 'mounted',
        lifecycle: {
          mountedAt: '2026-07-01T00:00:00.000Z'
        },
        renderContext: {
          input: {
            city: '上海'
          },
          data: {
            weather: {
              temperature: 28
            }
          }
        }
      })
    );
    await nextTick();

    const changedPart = wrapper.emitted('change')?.[0]?.[0] as ChatMessageWidgetPart;

    expect(changedPart).toMatchObject({
      status: 'mounted',
      renderContext: {
        data: {
          weather: {
            temperature: 28
          }
        }
      }
    });
  });

  it('finishes the message widget part by part id without a separate partIndex prop', async (): Promise<void> => {
    const staleWidgetPart = {
      ...createWidgetPart(
        ['export default class Weather extends Widget {', '  unmounted() {', '    this.submitted = { temperature: this.weather.temperature }', '  }', '}'].join(
          '\n'
        )
      ),
      id: 'widget-part-stale'
    };
    const targetWidgetPart = {
      ...createWidgetPart(
        ['export default class Weather extends Widget {', '  unmounted() {', '    this.submitted = { temperature: this.weather.temperature }', '  }', '}'].join(
          '\n'
        )
      ),
      id: 'widget-part-target',
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
    const staleToolPart = createOpenWidgetToolPartFromWidgetPart(staleWidgetPart);
    const targetToolPart = createOpenWidgetToolPartFromWidgetPart(targetWidgetPart);
    const wrapper = mountBubblePartWidget(targetToolPart, {
      message: createAssistantMessage({ id: 'assistant-widget-message', parts: [staleToolPart, targetToolPart] })
    });

    wrapper.findComponent({ name: 'BWidgetRuntime' }).vm.$emit(
      'change',
      createRuntimeChange(targetWidgetPart, {
        reason: 'interaction',
        status: 'finished',
        lifecycle: {
          ...targetWidgetPart.lifecycle,
          unmountedAt: '2026-07-01T00:01:00.000Z'
        },
        renderContext: {
          input: {
            city: '上海'
          },
          data: {
            submitted: {
              temperature: 35
            }
          }
        }
      })
    );
    await nextTick();

    const action = wrapper.emitted('submit')?.[0]?.[0] as BChatSubmitAction;
    const context = createSubmitContextMock();
    vi.mocked(context.getMessage).mockReturnValue(createAssistantMessage({ parts: [staleToolPart, targetToolPart] }));
    await action.run(context);

    expect(context.updateMessage).toHaveBeenCalledWith('assistant-widget-message', expect.any(Function));
    const [, updater] = vi.mocked(context.updateMessage).mock.calls[0];
    const nextMessage = updater(createAssistantMessage({ parts: [staleToolPart, targetToolPart] }));

    expect(nextMessage.parts[0]).toMatchObject({
      id: 'widget-part-stale',
      widget: {
        status: 'mounted'
      }
    });
    expect(nextMessage.parts[1]).toMatchObject({
      id: 'widget-part-target',
      widget: {
        status: 'finished',
        renderContext: {
          data: {
            submitted: {
              temperature: 35
            }
          }
        }
      }
    });
  });

  it('updates the message widget part without sending widget_result', async (): Promise<void> => {
    const widgetScript = [
      'export default class Weather extends Widget {',
      '  unmounted() {',
      '    this.submitted = { temperature: this.weather.temperature }',
      '  }',
      '}'
    ].join('\n');
    const widgetPart = createWidgetPart(widgetScript);
    const toolPart = createOpenWidgetToolPartFromWidgetPart(widgetPart);
    const wrapper = mountBubblePartWidget(toolPart, {
      message: createAssistantMessage({ id: 'assistant-widget-message', parts: [toolPart] })
    });

    wrapper.findComponent({ name: 'BWidgetRuntime' }).vm.$emit(
      'change',
      createRuntimeChange(widgetPart, {
        reason: 'interaction',
        status: 'finished',
        lifecycle: {
          ...widgetPart.lifecycle,
          unmountedAt: '2026-07-01T00:01:00.000Z'
        },
        renderContext: {
          input: {
            city: '上海'
          },
          data: {
            submitted: {
              temperature: 28
            }
          }
        }
      })
    );
    await nextTick();

    const action = wrapper.emitted('submit')?.[0]?.[0] as BChatSubmitAction;
    const context = createSubmitContextMock();
    vi.mocked(context.getMessage).mockReturnValue(createAssistantMessage({ parts: [toolPart] }));
    await action.run(context);

    expect(context.updateMessage).toHaveBeenCalledWith('assistant-widget-message', expect.any(Function));
    const [, updater] = vi.mocked(context.updateMessage).mock.calls[0];
    const nextMessage = updater(createAssistantMessage({ parts: [toolPart] }));

    expect(nextMessage.parts[0]).toMatchObject({
      widget: {
        status: 'finished',
        renderContext: {
          data: {
            submitted: {
              temperature: 28
            }
          }
        }
      }
    });
  });

  it('sends widget runtime messages reported by interaction changes', async (): Promise<void> => {
    const widgetPart = createWidgetPart('export default class Weather extends Widget {}');
    const toolPart = createOpenWidgetToolPartFromWidgetPart(widgetPart);
    const wrapper = mountBubblePartWidget(toolPart, {
      message: createAssistantMessage({ id: 'assistant-widget-message', parts: [toolPart] })
    });
    wrapper.findComponent({ name: 'BWidgetRuntime' }).vm.$emit(
      'change',
      createRuntimeChange(widgetPart, {
        reason: 'interaction',
        status: 'finished',
        lifecycle: {
          ...widgetPart.lifecycle,
          unmountedAt: '2026-07-01T00:01:00.000Z'
        },
        sendMessage: {
          content: '确认下单',
          isError: false
        }
      })
    );
    await nextTick();

    const action = wrapper.emitted('submit')?.[0]?.[0] as BChatSubmitAction;
    const context = createSubmitContextMock();
    vi.mocked(context.getMessage).mockReturnValue(createAssistantMessage({ parts: [toolPart] }));
    await action.run(context);

    expect(context.updateMessage).toHaveBeenCalledWith('assistant-widget-message', expect.any(Function));
    expect(context.sendAdaptedUserMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage: expect.objectContaining({
          content: '确认下单'
        })
      })
    );
  });
});
