/**
 * @file message-helper-widget.test.ts
 * @description BChat 小组件工具结果消息工具测试。
 */
import type { ChatMessageToolPart } from 'types/chat';
import { describe, expect, it } from 'vitest';
import { convert, initializeWidgetToolRuntimeParts, resolveWidgetPartFromToolResult } from '@/components/BChat/utils/messageHelper';
import type { Message } from '@/components/BChat/utils/types';
import { createDefaultWidgetData } from '@/components/BWidget/utils/widgetData';

/**
 * 创建 open_widget 成功工具片段。
 * @returns 工具消息片段
 */
function createOpenWidgetToolPart(): ChatMessageToolPart {
  return {
    id: 'tool-part-open-widget',
    type: 'tool',
    toolCallId: 'tool-call-widget',
    toolName: 'open_widget',
    status: 'done',
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
        value: createDefaultWidgetData(),
        renderContext: {
          input: {
            city: '上海'
          },
          data: {}
        }
      }
    }
  };
}

describe('messageHelper widget result', (): void => {
  it('resolves open_widget result as a widget message part', (): void => {
    const widgetPart = resolveWidgetPartFromToolResult(createOpenWidgetToolPart());

    expect(widgetPart).toMatchObject({
      type: 'widget',
      sessionId: 'widget-weather-tool-call-widget',
      status: 'created',
      lifecycle: {},
      value: {
        name: ''
      },
      renderContext: {
        input: {
          city: '上海'
        },
        data: {}
      }
    });
    expect(widgetPart).not.toHaveProperty('runtimeId');
  });

  it('ignores non widget tool results', (): void => {
    const toolPart = createOpenWidgetToolPart();
    toolPart.toolName = 'read_file';

    expect(resolveWidgetPartFromToolResult(toolPart)).toBeNull();
  });

  it('initializes open_widget tool parts with durable widget runtime data', (): void => {
    const toolPart = createOpenWidgetToolPart();
    const message: Message = {
      id: 'assistant-widget',
      role: 'assistant',
      content: '',
      parts: [toolPart],
      createdAt: '2026-06-30T00:00:00.000Z',
      finished: true
    };

    const nextMessage = initializeWidgetToolRuntimeParts(message);

    expect(nextMessage).not.toBe(message);
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
    expect(initializeWidgetToolRuntimeParts(nextMessage)).toBe(nextMessage);
  });

  it('keeps widget snapshots out of model-visible tool results', (): void => {
    const assistantMessage: Message = {
      id: 'assistant-widget',
      role: 'assistant',
      content: '',
      parts: [createOpenWidgetToolPart()],
      createdAt: '2026-06-30T00:00:00.000Z',
      finished: true
    };

    expect(convert.toModelMessages([assistantMessage])).toEqual([
      {
        role: 'assistant',
        content: [{ type: 'tool-call', toolCallId: 'tool-call-widget', toolName: 'open_widget', input: { id: 'weather' } }]
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'tool-call-widget',
            toolName: 'open_widget',
            output: {
              type: 'json',
              value: {
                toolName: 'open_widget',
                status: 'success',
                data: {
                  kind: 'widget_display',
                  sessionId: 'widget-weather-tool-call-widget',
                  widgetId: 'weather'
                }
              }
            }
          }
        ]
      }
    ]);
  });

  it('converts widget result parts into a model-visible user text part', (): void => {
    const userMessage: Message = {
      id: 'user-widget-result',
      role: 'user',
      content: '',
      parts: [
        {
          id: 'part0028',
          type: 'widget_result',
          sessionId: 'widget-coffee-tool-call-widget',
          widgetId: 'coffee',
          result: {
            status: 'success',
            data: {
              coffeeId: 'latte',
              size: 'large'
            }
          },
          submittedAt: '2026-06-30T12:00:00.000Z'
        } as unknown as Message['parts'][number]
      ],
      createdAt: '2026-06-30T12:00:00.000Z',
      finished: true
    };

    const modelMessages = convert.toModelMessages([userMessage]);

    expect(modelMessages).toHaveLength(1);
    expect(modelMessages[0]).toEqual({
      role: 'user',
      content: [
        {
          type: 'text',
          text: JSON.stringify(userMessage.parts[0], null, 2)
        }
      ]
    });
  });
});
