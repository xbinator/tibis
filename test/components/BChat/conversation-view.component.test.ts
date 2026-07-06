/**
 * @file conversation-view.component.test.ts
 * @description BChat ConversationView 渲染记忆更新测试。
 * @vitest-environment jsdom
 */
import type { ChatMessageToolPart, ChatMessageWidgetPart, ChatMessageWidgetRuntime } from 'types/chat';
import type { DefineComponent } from 'vue';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import ConversationView from '@/components/BChat/components/ConversationView.vue';
import type { Message } from '@/components/BChat/utils/types';
import { createDefaultWidgetData } from '@/components/BWidget/utils/widgetData';

vi.mock('@/components/BChat/components/MessageBubble.vue', () => ({
  default: {
    name: 'MessageBubble',
    props: {
      message: {
        type: Object,
        required: true
      },
      disabled: {
        type: Boolean,
        default: false
      },
      canRollback: {
        type: Function,
        default: undefined
      }
    },
    template: [
      '<div class="message-bubble">',
      '{{ message.parts[0]?.status ?? message.role }}:',
      '{{ message.parts[0]?.result?.status ?? "" }}:',
      '{{ disabled ? "disabled" : "enabled" }}:',
      '{{ canRollback && canRollback(message) ? "rollback" : "no-rollback" }}',
      '{{ message.parts[0]?.result?.data?.renderContext?.input?.city ?? "" }}',
      '{{ message.parts[0]?.widget?.renderContext?.data?.weather?.temperature ?? "" }}',
      '{{ message.parts[0]?.widget?.renderContext?.data?.message ?? "" }}',
      '</div>'
    ].join('')
  }
}));

/** ConversationView 测试所需 props。 */
interface ConversationViewTestProps {
  /** 消息列表 */
  messages: Message[];
  /** 是否处于聊天任务中 */
  loading: boolean;
  /** 是否禁用问题交互 */
  disabled: boolean;
  /** 判断消息是否可回退 */
  canRollback?: (message: Message) => boolean;
}

/** 带测试 props 类型的 ConversationView。 */
const ConversationViewForTest = ConversationView as DefineComponent<ConversationViewTestProps>;

/**
 * 创建提问工具片段。
 * @param status - 工具片段状态
 * @param resultStatus - 工具执行结果状态
 * @returns 工具片段
 */
function createQuestionToolPart(status: ChatMessageToolPart['status'], resultStatus?: 'awaiting_user_input'): ChatMessageToolPart {
  const part: ChatMessageToolPart = {
    id: 'part0002',
    type: 'tool',
    toolCallId: 'tool-call-question',
    toolName: 'question',
    status,
    input: {
      question: '确认下单生椰拿铁，实付 9.9?',
      mode: 'single',
      options: [{ label: '确认下单', value: 'confirm' }]
    }
  };

  if (resultStatus) {
    part.result = {
      toolName: 'question',
      status: resultStatus,
      data: {
        questionId: 'question-1',
        toolCallId: 'tool-call-question',
        question: '确认下单生椰拿铁，实付 9.9?',
        mode: 'single',
        options: [{ label: '确认下单', value: 'confirm' }]
      }
    };
  }

  return part;
}

/**
 * 创建打开小组件工具片段。
 * @param city - 渲染上下文城市
 * @returns 工具片段
 */
function createOpenWidgetToolPart(city: string): ChatMessageToolPart {
  const widgetValue = createDefaultWidgetData();

  return {
    id: 'tool-part-open-widget',
    type: 'tool',
    toolCallId: 'tool-call-widget',
    toolName: 'open_widget',
    status: 'done',
    presentation: 'widget',
    input: {
      id: 'weather'
    },
    result: {
      toolName: 'open_widget',
      status: 'success',
      data: {
        kind: 'widget_display',
        sessionId: 'widget-weather-tool-call-widget',
        widgetId: 'weather',
        value: widgetValue,
        renderContext: {
          input: {
            city
          },
          data: {}
        }
      }
    },
    widget: {
      sessionId: 'widget-weather-tool-call-widget',
      widgetId: 'weather',
      status: 'created',
      lifecycle: {},
      value: widgetValue,
      renderContext: {
        input: {
          city
        },
        data: {}
      }
    }
  };
}

/**
 * 创建小组件消息片段。
 * @param temperature - 状态中的温度值
 * @returns 小组件消息片段
 */
function createWidgetPart(temperature: number): ChatMessageWidgetPart {
  return {
    id: 'widget-part-weather',
    type: 'widget',
    sessionId: 'widget-session-1',
    widgetId: 'weather',
    status: 'mounted',
    lifecycle: {
      mountedAt: '2026-07-01T00:00:00.000Z'
    },
    value: {
      ...createDefaultWidgetData(),
      name: 'weather',
      description: '天气小组件',
      inputSchema: { type: 'object', properties: {} },
      dataSchema: { type: 'object', properties: {} },
      metadata: {},
      elements: []
    },
    renderContext: {
      input: {},
      data: {
        weather: {
          temperature
        }
      }
    }
  };
}

/**
 * 创建带内嵌运行态的小组件工具片段。
 * @param message - 运行态数据中的消息文本
 * @returns 工具片段
 */
function createOpenWidgetToolPartWithRuntimeMessage(message: string): ChatMessageToolPart {
  const part = createOpenWidgetToolPart('上海');
  const widget: ChatMessageWidgetRuntime = {
    sessionId: 'widget-weather-tool-call-widget',
    widgetId: 'weather',
    status: 'mounted',
    lifecycle: {
      mountedAt: '2026-07-03T00:00:00.000Z'
    },
    value: createWidgetPart(0).value,
    renderContext: {
      input: {
        city: '上海'
      },
      data: {
        message
      }
    }
  };

  return {
    ...part,
    widget
  };
}

/**
 * 从小组件视图片段创建 open_widget 工具片段。
 * @param widget - 小组件视图片段
 * @returns 带内嵌小组件运行态的工具片段
 */
function createOpenWidgetToolPartFromWidgetPart(widget: ChatMessageWidgetPart): ChatMessageToolPart {
  const part = createOpenWidgetToolPart('上海');

  return {
    ...part,
    id: widget.id,
    input: {
      id: widget.widgetId
    },
    result: {
      toolName: 'open_widget',
      status: 'success',
      data: {
        kind: 'widget_display',
        sessionId: widget.sessionId,
        widgetId: widget.widgetId,
        value: widget.value,
        renderContext: {
          input: {
            city: '上海'
          },
          data: {}
        }
      }
    },
    widget: {
      sessionId: widget.sessionId,
      widgetId: widget.widgetId,
      status: widget.status,
      lifecycle: widget.lifecycle,
      value: widget.value,
      renderContext: widget.renderContext
    }
  };
}

/**
 * 创建 assistant 消息。
 * @param part - 工具片段
 * @returns assistant 消息
 */
function createAssistantMessage(part: ChatMessageToolPart): Message {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: '',
    parts: [part],
    createdAt: '2026-06-22T00:00:00.000Z',
    loading: false,
    finished: false
  };
}

/**
 * 创建用户消息。
 * @param id - 消息 ID
 * @returns 用户消息
 */
function createUserMessage(id: string): Message {
  return {
    id,
    role: 'user',
    content: '你好',
    parts: [{ id: 'part0003', type: 'text', text: '你好' }],
    createdAt: '2026-06-22T00:00:00.000Z',
    loading: false,
    finished: true
  };
}

describe('ConversationView', (): void => {
  it('hides the back bottom button while loading at the bottom', (): void => {
    const wrapper = mount(ConversationViewForTest, {
      props: {
        messages: [],
        loading: true,
        disabled: false
      },
      global: {
        stubs: {
          BIcon: true
        }
      }
    });

    expect(wrapper.get('.to-bottom').classes()).not.toContain('to-bottom--visible');
  });

  it('updates a tool part when status changes without message finished changing', async (): Promise<void> => {
    const wrapper = mount(ConversationViewForTest, {
      props: {
        messages: [createAssistantMessage(createQuestionToolPart('inputting'))],
        loading: true,
        disabled: false
      },
      global: {
        stubs: {
          BIcon: true
        }
      }
    });

    expect(wrapper.get('.message-bubble').text()).toBe('inputting::enabled:no-rollback');

    await wrapper.setProps({
      messages: [createAssistantMessage(createQuestionToolPart('done', 'awaiting_user_input'))],
      loading: true,
      disabled: false
    });
    await nextTick();

    expect(wrapper.get('.message-bubble').text()).toBe('done:awaiting_user_input:enabled:no-rollback');
  });

  it('updates disabled data without message content changing', async (): Promise<void> => {
    const messages = [createAssistantMessage(createQuestionToolPart('done', 'awaiting_user_input'))];
    const wrapper = mount(ConversationViewForTest, {
      props: {
        messages,
        loading: true,
        disabled: false
      },
      global: {
        stubs: {
          BIcon: true
        }
      }
    });

    expect(wrapper.get('.message-bubble').text()).toBe('done:awaiting_user_input:enabled:no-rollback');

    await wrapper.setProps({
      messages,
      loading: true,
      disabled: true
    });
    await nextTick();

    expect(wrapper.get('.message-bubble').text()).toBe('done:awaiting_user_input:disabled:no-rollback');
  });

  it('updates open_widget display when result data changes without status changes', async (): Promise<void> => {
    const wrapper = mount(ConversationViewForTest, {
      props: {
        messages: [createAssistantMessage(createOpenWidgetToolPart('上海'))],
        loading: true,
        disabled: false
      },
      global: {
        stubs: {
          BIcon: true
        }
      }
    });

    expect(wrapper.get('.message-bubble').text()).toBe('done:success:enabled:no-rollback上海');

    await wrapper.setProps({
      messages: [createAssistantMessage(createOpenWidgetToolPart('杭州'))],
      loading: true,
      disabled: false
    });
    await nextTick();

    expect(wrapper.get('.message-bubble').text()).toBe('done:success:enabled:no-rollback杭州');
  });

  it('updates embedded open_widget runtime data when widget render context changes without tool status changes', async (): Promise<void> => {
    const wrapper = mount(ConversationViewForTest, {
      props: {
        messages: [createAssistantMessage(createOpenWidgetToolPartWithRuntimeMessage('等待用户操作'))],
        loading: true,
        disabled: false
      },
      global: {
        stubs: {
          BIcon: true
        }
      }
    });

    expect(wrapper.get('.message-bubble').text()).toBe('done:success:enabled:no-rollback上海等待用户操作');

    await wrapper.setProps({
      messages: [createAssistantMessage(createOpenWidgetToolPartWithRuntimeMessage('已经完成'))],
      loading: true,
      disabled: false
    });
    await nextTick();

    expect(wrapper.get('.message-bubble').text()).toBe('done:success:enabled:no-rollback上海已经完成');
  });

  it('updates widget display when render context data changes without status changes', async (): Promise<void> => {
    const wrapper = mount(ConversationViewForTest, {
      props: {
        messages: [createAssistantMessage(createOpenWidgetToolPartFromWidgetPart(createWidgetPart(28)))],
        loading: false,
        disabled: false
      },
      global: {
        stubs: {
          BIcon: true
        }
      }
    });

    expect(wrapper.get('.message-bubble').text()).toBe('done:success:enabled:no-rollback上海28');

    await wrapper.setProps({
      messages: [createAssistantMessage(createOpenWidgetToolPartFromWidgetPart(createWidgetPart(31)))],
      loading: false,
      disabled: false
    });
    await nextTick();

    expect(wrapper.get('.message-bubble').text()).toBe('done:success:enabled:no-rollback上海31');
  });

  it('forwards message bubble submit actions without inspecting them', async (): Promise<void> => {
    const submitAction = {
      run: vi.fn()
    };
    const wrapper = mount(ConversationViewForTest, {
      props: {
        messages: [createAssistantMessage(createQuestionToolPart('done', 'awaiting_user_input'))],
        loading: false,
        disabled: false
      },
      global: {
        stubs: {
          BIcon: true
        }
      }
    });

    wrapper.findComponent({ name: 'MessageBubble' }).vm.$emit('submit', submitAction);

    expect(wrapper.emitted('submit')?.[0]).toEqual([submitAction]);
  });

  it('updates rollback visibility when following messages change', async (): Promise<void> => {
    const userMessage = createUserMessage('user-1');
    let messages: Message[] = [userMessage];
    const canRollback = (message: Message): boolean => {
      const index = messages.findIndex((item) => item.id === message.id);

      return index >= 0 && messages.slice(index + 1).some((item) => item.role === 'assistant' || item.role === 'interrupt');
    };
    const wrapper = mount(ConversationViewForTest, {
      props: {
        messages,
        loading: true,
        disabled: false,
        canRollback
      },
      global: {
        stubs: {
          BIcon: true
        }
      }
    });

    expect(wrapper.get('.message-bubble').text()).toBe('user::enabled:no-rollback');

    messages = [userMessage, createAssistantMessage(createQuestionToolPart('done', 'awaiting_user_input'))];
    await wrapper.setProps({
      messages,
      loading: true,
      disabled: false,
      canRollback
    });
    await nextTick();

    expect(wrapper.findAll('.message-bubble')[0].text()).toBe('user::enabled:rollback');
  });
});
