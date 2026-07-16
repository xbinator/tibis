/**
 * @file model-message-context.test.ts
 * @description ChatRuntime 主进程模型上下文转换测试。
 */
import type { ChatMessageRecord } from 'types/chat';
import { describe, expect, it } from 'vitest';
import { createDefaultWidgetData } from '@/components/BWidget/utils/widgetData';
import { toRuntimeModelMessages } from '../../../../../../electron/main/modules/chat/runtime/context/model-message.mjs';

/**
 * 创建测试消息。
 * @param id - 消息 ID
 * @param role - 消息角色
 * @param content - 消息内容
 * @returns 测试消息
 */
function createMessage(id: string, role: ChatMessageRecord['role'], content: string): ChatMessageRecord {
  return {
    id,
    sessionId: 'session-1',
    role,
    content,
    parts: content ? [{ id: 'part0062', type: 'text', text: content }] : [],
    createdAt: `2026-06-19T00:00:0${id.length}.000Z`
  };
}

describe('runtime model message context', (): void => {
  it('converts current user message with prior assistant history', (): void => {
    const messages = [
      createMessage('u1', 'user', 'first question'),
      createMessage('a1', 'assistant', 'first answer'),
      createMessage('u2', 'user', 'follow up'),
      createMessage('draft', 'assistant', '')
    ];

    expect(toRuntimeModelMessages(messages)).toEqual([
      { role: 'user', content: 'first question' },
      { role: 'assistant', content: [{ type: 'text', text: 'first answer' }] },
      { role: 'user', content: 'follow up' }
    ]);
  });

  it('falls back to assistant content when legacy messages have no parts', (): void => {
    const assistant = createMessage('legacy-assistant', 'assistant', 'legacy answer');
    assistant.parts = [];

    expect(toRuntimeModelMessages([assistant])).toEqual([{ role: 'assistant', content: [{ type: 'text', text: 'legacy answer' }] }]);
  });

  it('does not expose compaction lifecycle parts to the model', (): void => {
    const assistant = createMessage('compaction-status', 'assistant', '');
    assistant.parts = [
      { id: 'part-before', type: 'text', text: '模型可见内容' },
      { id: 'compaction-pending', type: 'compaction', status: 'pending', trigger: 'automatic', createdAt: 1 },
      { id: 'compaction-failed', type: 'compaction', status: 'failed', trigger: 'automatic', errorCode: 'MODEL_FAILED', createdAt: 1, completedAt: 2 }
    ];

    expect(toRuntimeModelMessages([assistant])).toEqual([{ role: 'assistant', content: [{ type: 'text', text: '模型可见内容' }] }]);
  });

  it('converts user file parts into one XML text content for model compatibility', (): void => {
    const messages = toRuntimeModelMessages([
      {
        id: 'user-1',
        sessionId: 'session-1',
        role: 'user',
        content: 'fix {{@src/foo.ts#L10-20}}',
        parts: [
          { id: 'part0071', type: 'text', text: 'fix ' },
          {
            type: 'file',
            id: 'file-part-1',
            filename: 'foo.ts',
            mime: 'text/plain',
            url: 'file:///workspace/src/foo.ts?start=10&end=20',
            path: 'src/foo.ts',
            sourceText: { start: 4, end: 25, value: '{{@src/foo.ts#L10-20}}' },
            snapshot: {
              content: 'export const foo = 1;',
              startLine: 10,
              endLine: 20,
              totalLines: 100,
              contentHash: 'hash-1',
              capturedAt: '2026-06-20T00:00:00.000Z'
            }
          }
        ],
        createdAt: '2026-06-20T00:00:00.000Z',
        finished: true
      }
    ]);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({
      role: 'user',
      content: 'fix <file path="src/foo.ts" lines="10-20">\nexport const foo = 1;\n</file>'
    });
    expect(JSON.stringify(messages)).not.toContain('"type":"file"');
  });

  it('converts completed tool parts into assistant tool calls and tool results', (): void => {
    const assistant = createMessage('a-tool', 'assistant', '');
    assistant.parts = [
      { id: 'part0072', type: 'text', text: 'I will inspect the file.' },
      {
        id: 'part0073',
        type: 'tool',
        toolCallId: 'tool-call-1',
        toolName: 'read_file',
        status: 'done',
        input: { path: 'src/index.ts' },
        result: { toolName: 'read_file', status: 'success', data: { content: 'export const ok = true;' } }
      },
      { id: 'part0074', type: 'text', text: 'The file exports ok.' }
    ];

    expect(toRuntimeModelMessages([assistant])).toEqual([
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'I will inspect the file.' },
          { type: 'tool-call', toolCallId: 'tool-call-1', toolName: 'read_file', input: { path: 'src/index.ts' } }
        ]
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'tool-call-1',
            toolName: 'read_file',
            output: { type: 'json', value: { toolName: 'read_file', status: 'success', data: { content: 'export const ok = true;' } } }
          }
        ]
      },
      { role: 'assistant', content: [{ type: 'text', text: 'The file exports ok.' }] }
    ]);
  });

  it('keeps open_widget snapshots out of runtime model tool results', (): void => {
    const assistant = createMessage('a-widget', 'assistant', '');
    assistant.parts = [
      {
        id: 'part0075',
        type: 'tool',
        toolCallId: 'tool-call-widget',
        toolName: 'open_widget',
        status: 'done',
        input: { id: 'weather' },
        result: {
          toolName: 'open_widget',
          status: 'success',
          data: {
            sessionId: 'widget-weather-tool-call-widget',
            widgetId: 'weather',
            value: createDefaultWidgetData(),
            renderContext: {
              input: { city: '上海' },
              output: undefined,
              data: {}
            },
            execution: {
              status: 'success',
              output: undefined
            }
          }
        }
      }
    ];

    expect(toRuntimeModelMessages([assistant])).toEqual([
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
                  sessionId: 'widget-weather-tool-call-widget',
                  widgetId: 'weather',
                  execution: {
                    status: 'success',
                    output: undefined
                  }
                }
              }
            }
          }
        ]
      }
    ]);
  });

  it('invalidates stale Skill tool results for the next runtime request', (): void => {
    const assistant = createMessage('a-skill', 'assistant', '');
    assistant.parts = [
      {
        id: 'part-skill',
        type: 'tool',
        toolCallId: 'tool-call-skill',
        toolName: 'skill',
        status: 'done',
        input: { name: 'weather' },
        result: {
          toolName: 'skill',
          status: 'success',
          data: '<skill_metadata><content_hash>old-hash</content_hash></skill_metadata><skill_content name="weather">old instructions</skill_content>'
        }
      }
    ];

    const modelMessages = toRuntimeModelMessages([assistant], { skillContentHashes: { weather: 'new-hash' } });
    const serialized = JSON.stringify(modelMessages);

    expect(serialized).toContain('skill_invalidated');
    expect(serialized).not.toContain('old instructions');
  });

  it('retains Skill tool results when the content version is current', (): void => {
    const assistant = createMessage('a-skill-current', 'assistant', '');
    assistant.parts = [
      {
        id: 'part-skill-current',
        type: 'tool',
        toolCallId: 'tool-call-skill-current',
        toolName: 'skill',
        status: 'done',
        input: { name: 'weather' },
        result: {
          toolName: 'skill',
          status: 'success',
          data: '<skill_metadata><content_hash>same-hash</content_hash></skill_metadata><skill_content name="weather">current instructions</skill_content>'
        }
      }
    ];

    const modelMessages = toRuntimeModelMessages([assistant], { skillContentHashes: { weather: 'same-hash' } });

    expect(JSON.stringify(modelMessages)).toContain('current instructions');
  });

  it('converts widget result parts into a runtime model user text part', (): void => {
    const userMessage = createMessage('u-widget-result', 'user', '');
    const widgetResultPart: ChatMessageRecord['parts'][number] = {
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
    } as unknown as ChatMessageRecord['parts'][number];
    userMessage.parts = [widgetResultPart];

    const modelMessages = toRuntimeModelMessages([userMessage]);

    expect(modelMessages).toHaveLength(1);
    expect(modelMessages[0]).toEqual({
      role: 'user',
      content: [
        {
          type: 'text',
          text: JSON.stringify(widgetResultPart, null, 2)
        }
      ]
    });
  });
});
