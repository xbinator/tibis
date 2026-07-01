/**
 * @file bubble-part-widget.component.test.ts
 * @description BChat BubblePartWidget 小组件运行态提交测试。
 * @vitest-environment jsdom
 */
import type { ChatMessageWidgetPart } from 'types/chat';
import { defineComponent } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import BubblePartWidget from '@/components/BChat/components/MessageBubble/BubblePartWidget.vue';
import type { BChatSubmitAction, BChatSubmitContext } from '@/components/BChat/utils/submitAction';
import type { Message } from '@/components/BChat/utils/types';
import type { WidgetData, WidgetRenderContext } from '@/components/BWidget/types';
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
 * @param code - 小组件交互脚本
 * @returns 小组件快照数据
 */
function createWidgetData(code: string): WidgetData {
  return {
    ...createDefaultWidgetData(),
    execute: {
      code,
      timeout: 10000
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

describe('BubblePartWidget', (): void => {
  it('finishes the message widget part before sending submit result', async (): Promise<void> => {
    const widgetPart = createWidgetPart(
      ['defineConfig({', '  unmounted() {', "    this.$setState('submitted.temperature', this.$state.weather.temperature)", '  }', '})'].join('\n')
    );
    const wrapper = mountBubblePartWidget(widgetPart, {
      messageId: 'assistant-widget-message',
      partIndex: 0
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
