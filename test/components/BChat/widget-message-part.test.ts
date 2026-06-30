/**
 * @file widget-message-part.test.ts
 * @description 验证聊天小组件消息片段工厂与模型上下文转换边界。
 */
import { describe, expect, it } from 'vitest';
import { convert } from '@/components/BChat/utils/messageHelper';
import type { Message } from '@/components/BChat/utils/types';
import { createWidgetMessagePart } from '@/components/BChat/utils/widgetMessagePart';
import type { WidgetData, WidgetRenderContext } from '@/components/BWidget/types';
import { createDefaultWidgetData } from '@/components/BWidget/utils/widgetData';

/**
 * 创建测试小组件数据。
 * @returns 小组件数据
 */
function createDataItem(): WidgetData {
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
    ]
  };
}

/**
 * 创建测试渲染上下文。
 * @returns 渲染上下文
 */
function createRenderContext(): WidgetRenderContext {
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
 * 创建带小组件片段的助手消息。
 * @returns 助手消息
 */
function createWidgetAssistantMessage(): Message {
  return {
    id: 'assistant-widget-1',
    role: 'assistant',
    content: '',
    parts: [
      createWidgetMessagePart({
        sessionId: 'widget-session-1',
        status: 'success',
        dataItem: createDataItem(),
        renderContext: createRenderContext()
      })
    ],
    createdAt: '2026-06-29T00:00:00.000Z',
    finished: true
  };
}

describe('widgetMessagePart', (): void => {
  it('creates a chat widget part from a snapshot and render context', (): void => {
    const dataItem = createDataItem();
    const renderContext = createRenderContext();
    const part = createWidgetMessagePart({
      sessionId: 'widget-session-1',
      status: 'success',
      dataItem,
      renderContext
    });

    expect(part).toEqual({
      type: 'widget',
      sessionId: 'widget-session-1',
      status: 'success',
      dataItem,
      renderContext
    });
  });

  it('keeps widget parts out of model messages before execution protocol exists', (): void => {
    const modelMessages = convert.toModelMessages([createWidgetAssistantMessage()]);

    expect(modelMessages).toEqual([]);
  });
});
