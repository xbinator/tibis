/**
 * @file bubble-part-widget.component.test.ts
 * @description BChat BubblePartWidget 小组件运行态提交测试。
 * @vitest-environment jsdom
 */
import type { ChatMessageToolPart, ChatMessageWidgetPart } from 'types/chat';
import type { WidgetData, WidgetRenderContext } from 'types/widget';
import { defineComponent, nextTick } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import BubblePartWidget from '@/components/BChat/components/MessageBubble/BubblePartWidget.vue';
import { resolveWidgetPartFromToolResult } from '@/components/BChat/utils/messageHelper';
import type { BChatSubmitAction, BChatSubmitContext } from '@/components/BChat/utils/submitAction';
import type { Message } from '@/components/BChat/utils/types';
import { createDefaultWidgetData } from '@/components/BWidget/utils/widgetData';

const requestMock = vi.hoisted(() => vi.fn());

vi.mock('@/shared/platform/electron-api', () => ({
  getElectronAPI: () => ({
    request: requestMock
  })
}));

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
 * @param code - 小组件交互脚本
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
    state: {
      weather: {
        temperature: 28
      }
    }
  };
}

/**
 * 创建小组件消息片段。
 * @param code - 小组件交互脚本
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

/** BWidgetRuntime 测试替身。 */
const BWidgetRuntimeStub = defineComponent({
  name: 'BWidgetRuntime',
  emits: ['submit'],
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
  it('initializes preview widget runtime state on open_widget tool parts', async (): Promise<void> => {
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
          value: createWidgetData('defineConfig({})'),
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

  it('initializes mounted state with the managed request client', async (): Promise<void> => {
    requestMock.mockResolvedValue({
      status: 200,
      ok: true,
      url: 'https://api.example.com/weather?city=%E4%B8%8A%E6%B5%B7',
      headers: {},
      data: { temperature: 28 }
    });
    const widgetPart: ChatMessageWidgetPart = {
      ...createWidgetPart(
        [
          'defineConfig({',
          '  async mounted() {',
          "    const weather = await this.$http.get('https://api.example.com/weather', { query: { city: this.$input.city } })",
          "    this.$setState('weather.temperature', weather.data.temperature)",
          '  }',
          '})'
        ].join('\n')
      ),
      status: 'created',
      lifecycle: {},
      renderContext: {
        input: {
          city: '上海'
        },
        state: {}
      }
    };

    const wrapper = mountBubblePartWidget(widgetPart);
    await flushWidgetRuntime();

    const changedPart = wrapper.emitted('change')?.[0]?.[0] as ChatMessageWidgetPart;

    expect(requestMock).toHaveBeenCalledWith({
      method: 'GET',
      url: 'https://api.example.com/weather',
      query: {
        city: '上海'
      }
    });
    expect(changedPart).toMatchObject({
      status: 'mounted',
      renderContext: {
        state: {
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
        ['defineConfig({', '  unmounted() {', "    this.$setState('submitted.temperature', this.$state.weather.temperature)", '  }', '})'].join('\n')
      ),
      id: 'widget-part-stale'
    };
    const targetWidgetPart = {
      ...createWidgetPart(
        ['defineConfig({', '  unmounted() {', "    this.$setState('submitted.temperature', this.$state.weather.temperature)", '  }', '})'].join('\n')
      ),
      id: 'widget-part-target',
      renderContext: {
        input: {
          city: '上海'
        },
        state: {
          weather: {
            temperature: 35
          }
        }
      }
    };
    const wrapper = mountBubblePartWidget(targetWidgetPart, {
      messageId: 'assistant-widget-message'
    });

    await wrapper.get('.widget-submit').trigger('click');

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
        state: {
          submitted: {
            temperature: 35
          }
        }
      }
    });
  });

  it('finishes the message widget part before sending submit result', async (): Promise<void> => {
    const widgetPart = createWidgetPart(
      ['defineConfig({', '  unmounted() {', "    this.$setState('submitted.temperature', this.$state.weather.temperature)", '  }', '})'].join('\n')
    );
    const wrapper = mountBubblePartWidget(widgetPart, {
      messageId: 'assistant-widget-message'
    });

    await wrapper.get('.widget-submit').trigger('click');

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
        state: {
          submitted: {
            temperature: 28
          }
        }
      }
    });
  });
});
