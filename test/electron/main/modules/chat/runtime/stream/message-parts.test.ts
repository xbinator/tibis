/**
 * @file message-parts.test.ts
 * @description ChatRuntime assistant 消息片段写入测试。
 */
import type { ChatMessageRecord } from 'types/chat';
import { describe, expect, it } from 'vitest';
import { createDefaultWidgetData } from '@/components/BWidget/utils/widgetData';
import { appendToolResult } from '../../../../../../../electron/main/modules/chat/runtime/stream/message-parts.mjs';

/**
 * 创建 assistant 测试消息。
 * @returns assistant 消息
 */
function createAssistantMessage(): ChatMessageRecord {
  return {
    id: 'assistant-1',
    sessionId: 'session-1',
    role: 'assistant',
    content: '',
    parts: [],
    createdAt: '2026-06-30T00:00:00.000Z',
    loading: true,
    finished: false
  };
}

describe('runtime stream message parts', (): void => {
  it('keeps open_widget result as a tool part without appending widget part', (): void => {
    const message = createAssistantMessage();
    const widgetValue = {
      ...createDefaultWidgetData(),
      name: '天气小组件',
      description: '根据城市展示天气'
    };

    appendToolResult(message, {
      type: 'tool-result',
      toolCallId: 'tool-call-widget',
      toolName: 'open_widget',
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
              city: '上海'
            },
            data: {}
          }
        }
      }
    });

    expect(message.parts[0]).toMatchObject({
      type: 'tool',
      toolCallId: 'tool-call-widget',
      toolName: 'open_widget',
      status: 'done',
      result: expect.objectContaining({
        data: expect.objectContaining({
          kind: 'widget_display',
          value: widgetValue
        })
      })
    });
    expect(message.parts[0]).not.toHaveProperty('presentation');
    expect(message.parts[0]).not.toHaveProperty('widget');
    expect(message.parts[0]).not.toHaveProperty('state');
    expect(message.parts).toHaveLength(1);
  });
});
