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
import { resolveWidgetPartFromToolResult } from '@/components/BChat/utils/messageHelper';
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
  emits: ['change', 'submit'],
  template: '<button class="widget-submit" type="button" @click="$emit(\'submit\', { coffeeId: \'latte\' })">提交</button>'
});

/**
 * 挂载小组件消息片段。
 * @param part - 小组件消息片段
 * @param props - 额外组件入参
 * @returns 组件包装器
 */
function mountBubblePartWidget(part: ChatMessageWidgetPart, props: Record<string, unknown> = {}): VueWrapper {
  return mount(BubblePartWidget, {
    props: {
      part,
      runtimeEnabled: true,
      ...props
    },
    global: {
      stubs: {
        BWidgetRuntime: BWidgetRuntimeStub
      }
    }
  });
}

/**
 * 等待小组件运行态初始化完成。
 * @returns 异步完成信号
 */
async function flushWidgetRuntime(): Promise<void> {
  await nextTick();
  await Promise.resolve();
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
  await nextTick();
}

describe('BubblePartWidget', (): void => {
  it('initializes preview widget runtime data on open_widget tool parts', async (): Promise<void> => {
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
          value: createWidgetData('Widget({})'),
          renderContext: createWidgetRenderContext()
        }
      }
    };
    const widgetPart = resolveWidgetPartFromToolResult(toolPart);
    if (!widgetPart) {
      throw new Error('open_widget 工具结果未生成小组件片段');
    }

    const wrapper = mountBubblePartWidget(widgetPart, {
      messageId: 'assistant-widget-message',
      runtimeEnabled: false
    });
    await flushWidgetRuntime();

    const action = wrapper.emitted('submit')?.[0]?.[0] as BChatSubmitAction;
    const context = createSubmitContextMock();
    await action.run(context);

    expect(context.updateMessage).toHaveBeenCalledWith('assistant-widget-message', expect.any(Function));
    const [, updater] = vi.mocked(context.updateMessage).mock.calls[0];
    const nextMessage = updater(createAssistantMessage({ parts: [toolPart] }));

    expect(nextMessage.parts).toEqual([
      expect.objectContaining({
        ...toolPart,
        widget: expect.objectContaining({
          sessionId: 'widget-coffee-session',
          widgetId: 'coffee',
          status: 'created'
        })
      })
    ]);
  });

  it('emits changed widget parts when the runtime view reports mounted data', async (): Promise<void> => {
    const widgetPart: ChatMessageWidgetPart = {
      ...createWidgetPart('Widget({})'),
      status: 'created',
      lifecycle: {},
      renderContext: {
        input: {
          city: '上海'
        },
        data: {}
      }
    };

    const wrapper = mountBubblePartWidget(widgetPart);
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
        ['Widget({', '  unmounted() {', '    this.submitted = { temperature: this.weather.temperature }', '  }', '})'].join('\n')
      ),
      id: 'widget-part-stale'
    };
    const targetWidgetPart = {
      ...createWidgetPart(
        ['Widget({', '  unmounted() {', '    this.submitted = { temperature: this.weather.temperature }', '  }', '})'].join('\n')
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
    const wrapper = mountBubblePartWidget(targetWidgetPart, {
      messageId: 'assistant-widget-message'
    });

    wrapper.findComponent({ name: 'BWidgetRuntime' }).vm.$emit(
      'change',
      createRuntimeChange(targetWidgetPart, {
        reason: 'submit',
        output: {
          coffeeId: 'latte'
        },
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
    vi.mocked(context.getMessage).mockReturnValue(createAssistantMessage({ parts: [staleWidgetPart, targetWidgetPart] }));
    await action.run(context);

    expect(context.updateMessage).toHaveBeenCalledWith('assistant-widget-message', expect.any(Function));
    const [, updater] = vi.mocked(context.updateMessage).mock.calls[0];
    const nextMessage = updater(createAssistantMessage({ parts: [staleWidgetPart, targetWidgetPart] }));

    expect(nextMessage.parts[0]).toMatchObject({
      id: 'widget-part-stale',
      status: 'mounted'
    });
    expect(nextMessage.parts[1]).toMatchObject({
      id: 'widget-part-target',
      status: 'finished',
      renderContext: {
        data: {
          submitted: {
            temperature: 35
          }
        }
      }
    });
  });

  it('finishes the message widget part before sending submit result', async (): Promise<void> => {
    const widgetPart = createWidgetPart(
      ['Widget({', '  unmounted() {', '    this.submitted = { temperature: this.weather.temperature }', '  }', '})'].join('\n')
    );
    const wrapper = mountBubblePartWidget(widgetPart, {
      messageId: 'assistant-widget-message'
    });

    wrapper.findComponent({ name: 'BWidgetRuntime' }).vm.$emit(
      'change',
      createRuntimeChange(widgetPart, {
        reason: 'submit',
        output: {
          coffeeId: 'latte'
        },
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
    vi.mocked(context.getMessage).mockReturnValue(createAssistantMessage({ parts: [widgetPart] }));
    await action.run(context);

    expect(context.updateMessage).toHaveBeenCalledWith('assistant-widget-message', expect.any(Function));
    const [, updater] = vi.mocked(context.updateMessage).mock.calls[0];
    const nextMessage = updater(createAssistantMessage({ parts: [widgetPart] }));

    expect(nextMessage.parts[0]).toMatchObject({
      status: 'finished',
      renderContext: {
        data: {
          submitted: {
            temperature: 28
          }
        }
      }
    });
  });

  it('sends widget runtime messages reported by interaction changes', async (): Promise<void> => {
    const widgetPart = createWidgetPart('Widget({})');
    const wrapper = mountBubblePartWidget(widgetPart, {
      messageId: 'assistant-widget-message'
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
    vi.mocked(context.getMessage).mockReturnValue(createAssistantMessage({ parts: [widgetPart] }));
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
