/**
 * @file bubble-part-widget.component.test.ts
 * @description BChat BubblePartWidget 小组件运行态提交测试。
 * @vitest-environment jsdom
 */
import type { ChatMessageToolPart, ChatMessageToolPartState } from 'types/chat';
import type { WidgetData, WidgetRenderContext } from 'types/widget';
import { defineComponent, nextTick } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import BubblePartWidget from '@/components/BChat/components/MessageBubble/BubblePartWidget/index.vue';
import type { BChatSubmitAction, BChatSubmitContext } from '@/components/BChat/utils/submitAction';
import { createDefaultWidgetData } from '@/components/BWidget/utils/widgetData';
import type { WidgetRuntimeChange } from '@/components/BWidget/utils/widgetRuntime';

/** 测试用工具片段 state 更新函数。 */
type TestToolPartStateUpdater = (state: ChatMessageToolPartState | undefined) => ChatMessageToolPartState | undefined;

/**
 * open_widget 工具片段测试用展示数据来源。
 */
interface TestWidgetDisplayFixture {
  /** 片段唯一标识 */
  id: string;
  /** 小组件会话 ID */
  sessionId: string;
  /** 小组件稳定 ID */
  widgetId: string;
  /** 小组件快照值 */
  value: WidgetData;
  /** 小组件渲染上下文 */
  renderContext: WidgetRenderContext;
}

/**
 * 带工具片段 state 更新能力的提交上下文测试替身。
 */
interface TestSubmitContext extends Pick<BChatSubmitContext, 'continueAssistantTurn' | 'sendAdaptedUserMessage'> {
  /** 更新指定工具片段 state */
  updateToolPartState: ReturnType<typeof vi.fn<(messageId: string, partId: string, updater: TestToolPartStateUpdater) => Promise<void>>>;
}

/**
 * 创建统一提交上下文测试替身。
 * @returns 提交上下文测试替身
 */
function createSubmitContextMock(): TestSubmitContext {
  return {
    continueAssistantTurn: vi.fn(),
    sendAdaptedUserMessage: vi.fn(),
    updateToolPartState: vi.fn<(messageId: string, partId: string, updater: TestToolPartStateUpdater) => Promise<void>>()
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
function createWidgetPart(code: string): TestWidgetDisplayFixture {
  return {
    id: `widget-part-${code.length}`,
    sessionId: 'widget-coffee-session',
    widgetId: 'coffee',
    value: createWidgetData(code),
    renderContext: createWidgetRenderContext()
  };
}

/**
 * 从小组件视图片段创建 open_widget 工具片段。
 * @param part - 小组件视图片段
 * @param state - 工具运行数据
 * @returns 承载小组件运行态的工具消息片段
 */
function createOpenWidgetToolPartFromWidgetPart(part: TestWidgetDisplayFixture, state?: ChatMessageToolPartState): ChatMessageToolPart {
  return {
    id: part.id,
    type: 'tool',
    toolCallId: `tool-call-${part.id}`,
    toolName: 'open_widget',
    status: 'done',
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
    ...(state ? { state } : {})
  };
}

/**
 * 创建 BWidgetRuntime 运行态变化事件。
 * @param part - 来源小组件片段
 * @param change - 运行态变化覆盖字段
 * @returns 运行态变化事件
 */
function createRuntimeChange(part: TestWidgetDisplayFixture, change: Partial<WidgetRuntimeChange> = {}): WidgetRuntimeChange {
  return {
    reason: 'mount',
    value: part.value,
    renderContext: part.renderContext,
    ...change
  };
}

/** BWidgetRuntime 测试替身。 */
const BWidgetRuntimeStub = defineComponent({
  name: 'BWidgetRuntime',
  props: {
    renderContext: {
      type: Object,
      required: true
    },
    runtimeEnabled: {
      type: Boolean,
      default: false
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
      messageId: 'assistant-widget-message',
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
  it('renders widget runtime data from open_widget tool results', (): void => {
    const widgetValue = createWidgetData('export default class Weather extends Widget {}');
    const renderContext = createWidgetRenderContext();
    const toolPart: ChatMessageToolPart = {
      id: 'tool-open-widget',
      type: 'tool',
      toolCallId: 'tool-call-widget',
      toolName: 'open_widget',
      status: 'done',
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
      }
    };
    const wrapper = mountBubblePartWidget(toolPart, {
      messageId: 'assistant-widget-message'
    });

    expect(wrapper.findComponent({ name: 'BWidgetRuntime' }).props()).toMatchObject({
      renderContext,
      runtimeEnabled: true,
      value: widgetValue
    });
  });

  it('overrides widget render data from tool state', (): void => {
    const widgetValue = createWidgetData('export default class Weather extends Widget {}');
    const renderContext = createWidgetRenderContext();
    const toolPart: ChatMessageToolPart = {
      id: 'tool-open-widget',
      type: 'tool',
      toolCallId: 'tool-call-widget',
      toolName: 'open_widget',
      status: 'done',
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
      state: {
        renderData: {
          weather: {
            temperature: 31
          }
        }
      }
    };
    const wrapper = mountBubblePartWidget(toolPart, {
      messageId: 'assistant-widget-message'
    });

    expect(wrapper.findComponent({ name: 'BWidgetRuntime' }).props('renderContext')).toMatchObject({
      input: {
        city: '上海'
      },
      data: {
        weather: {
          temperature: 31
        }
      }
    });
  });

  it('updates local runtime data without emitting widget part changes', async (): Promise<void> => {
    const widgetPart: TestWidgetDisplayFixture = {
      ...createWidgetPart('export default class Weather extends Widget {}'),
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

    expect(wrapper.emitted('change')).toBeUndefined();
    expect(wrapper.findComponent({ name: 'BWidgetRuntime' }).props('renderContext')).toMatchObject({
      data: {
        weather: {
          temperature: 28
        }
      }
    });
  });

  it('keeps the visible runtime state when streaming props fall back to created', async (): Promise<void> => {
    const widgetPart: TestWidgetDisplayFixture = {
      ...createWidgetPart('export default class Weather extends Widget {}'),
      renderContext: {
        input: {
          city: '上海'
        },
        data: {}
      }
    };
    const initialToolPart = createOpenWidgetToolPartFromWidgetPart(widgetPart);
    const wrapper = mountBubblePartWidget(initialToolPart, {
      messageId: 'assistant-widget-message'
    });

    wrapper.findComponent({ name: 'BWidgetRuntime' }).vm.$emit(
      'change',
      createRuntimeChange(widgetPart, {
        reason: 'mount',
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

    const staleToolPart = createOpenWidgetToolPartFromWidgetPart(widgetPart);
    await wrapper.setProps({
      part: staleToolPart,
      messageId: 'assistant-widget-message'
    });
    await nextTick();

    expect(wrapper.findComponent({ name: 'BWidgetRuntime' }).props()).toMatchObject({
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
      messageId: 'assistant-widget-message'
    });

    wrapper.findComponent({ name: 'BWidgetRuntime' }).vm.$emit(
      'change',
      createRuntimeChange(targetWidgetPart, {
        reason: 'interaction',
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
    await action.run(context);

    expect(context.updateToolPartState).toHaveBeenCalledWith('assistant-widget-message', 'widget-part-target', expect.any(Function));
    const [, , updater] = context.updateToolPartState.mock.calls[0];

    expect(updater(undefined)).toEqual({
      renderData: {
        submitted: {
          temperature: 35
        }
      }
    });
    expect(
      updater({
        renderData: {
          weather: {
            temperature: 35
          }
        }
      })
    ).toEqual({
      renderData: {
        submitted: {
          temperature: 35
        }
      }
    });
    expect(staleToolPart).toMatchObject({
      id: 'widget-part-stale'
    });
    expect(targetToolPart).not.toHaveProperty('state.renderData.submitted');
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
      messageId: 'assistant-widget-message'
    });

    wrapper.findComponent({ name: 'BWidgetRuntime' }).vm.$emit(
      'change',
      createRuntimeChange(widgetPart, {
        reason: 'interaction',
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
    await action.run(context);

    expect(context.updateToolPartState).toHaveBeenCalledWith('assistant-widget-message', toolPart.id, expect.any(Function));
    const [, , updater] = context.updateToolPartState.mock.calls[0];

    expect(updater(undefined)).toEqual({
      renderData: {
        submitted: {
          temperature: 28
        }
      }
    });
    expect(
      updater({
        renderData: {
          old: true
        }
      })
    ).toEqual({
      renderData: {
        submitted: {
          temperature: 28
        }
      }
    });
  });

  it('sends widget runtime messages reported by interaction changes', async (): Promise<void> => {
    const widgetPart = createWidgetPart('export default class Weather extends Widget {}');
    const toolPart = createOpenWidgetToolPartFromWidgetPart(widgetPart);
    const wrapper = mountBubblePartWidget(toolPart, {
      messageId: 'assistant-widget-message'
    });
    wrapper.findComponent({ name: 'BWidgetRuntime' }).vm.$emit(
      'change',
      createRuntimeChange(widgetPart, {
        reason: 'interaction',
        sendMessage: {
          content: '确认下单',
          isError: false
        }
      })
    );
    await nextTick();

    const action = wrapper.emitted('submit')?.[0]?.[0] as BChatSubmitAction;
    const context = createSubmitContextMock();
    await action.run(context);

    expect(context.updateToolPartState).toHaveBeenCalledWith('assistant-widget-message', toolPart.id, expect.any(Function));
    expect(context.sendAdaptedUserMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage: expect.objectContaining({
          content: '确认下单'
        })
      })
    );
  });
});
