/**
 * @file widget-skill-draft.test.ts
 * @description 验证聊天侧小组件 skill 草稿匹配与消息创建。
 */
import type { ChatMessageWidgetPart } from 'types/chat';
import { describe, expect, it } from 'vitest';
import {
  createWidgetSkillDraftAssistantMessage,
  resolveWidgetSkillDraft,
  resolveWidgetSkillDraftFromDataItems
} from '@/components/BChat/utils/widgetSkillDraft';
import type { WidgetData } from '@/components/BWidget/types';
import { createDefaultWidgetData } from '@/components/BWidget/utils/widgetData';
import { writeWidgetPreviewRenderContext } from '@/components/BWidget/utils/widgetPreviewContext';

/**
 * 创建测试用茶饮小组件数据。
 * @returns 茶饮小组件数据
 */
function createTeaDataItem(): WidgetData {
  return {
    ...createDefaultWidgetData(),
    name: 'tea',
    description: '展示茶饮推荐',
    inputSchema: {
      type: 'object',
      properties: {
        preference: {
          type: 'string',
          description: '口味偏好'
        }
      }
    },
    metadata: writeWidgetPreviewRenderContext(
      {
        skill: {
          name: 'tea',
          description: '茶饮推荐',
          triggers: ['茶饮'],
          aliases: ['喝茶']
        }
      },
      {
        input: {
          preference: '热饮'
        },
        state: {
          tea: {
            recommended: '乌龙茶'
          }
        }
      }
    ),
    elements: [
      {
        id: 'tea-title',
        name: 'text',
        label: '文本',
        icon: 'lucide:type',
        title: '茶饮推荐',
        position: { x: 0, y: 0 },
        size: { width: 180, height: 40 },
        rotation: 0,
        style: {},
        metadata: {
          content: '推荐：{{ state.tea.recommended }}'
        }
      }
    ]
  };
}

describe('widgetSkillDraft', (): void => {
  it('does not resolve widget drafts without a configured widget data source', (): void => {
    expect(resolveWidgetSkillDraft('帮我查天气 上海')).toBeNull();
    expect(resolveWidgetSkillDraft('今天喝咖啡')).toBeNull();
  });

  it('resolves custom widget data items through metadata skill triggers and aliases', (): void => {
    const draft = resolveWidgetSkillDraftFromDataItems('今天想喝茶', [createTeaDataItem()]);

    expect(draft?.skillName).toBe('tea');
    expect(draft?.part).toMatchObject({
      type: 'widget',
      sessionId: 'widget-skill-tea-draft',
      status: 'success',
      renderContext: {
        input: {
          preference: '热饮'
        },
        state: {
          tea: {
            recommended: '乌龙茶'
          }
        }
      }
    });
    expect(draft?.part.dataItem.name).toBe('tea');
  });

  it('returns null for unmatched user input', (): void => {
    expect(resolveWidgetSkillDraft('总结一下项目')).toBeNull();
  });

  it('creates an assistant message from a resolved widget draft', (): void => {
    const draft = resolveWidgetSkillDraftFromDataItems('今天想喝茶', [createTeaDataItem()]);
    expect(draft).not.toBeNull();

    const message = createWidgetSkillDraftAssistantMessage(draft!);
    const part = message.parts[0] as ChatMessageWidgetPart;

    expect(message).toMatchObject({
      role: 'assistant',
      content: '',
      loading: false,
      finished: true
    });
    expect(part.renderContext.state).toMatchObject({
      tea: {
        recommended: '乌龙茶'
      }
    });
  });
});
