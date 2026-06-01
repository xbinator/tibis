/**
 * @file MemoryTool/index.ts
 * @description 记忆编辑工具（只写），AI 通过 system prompt 已持有记忆内容，直接 edit 即可。
 */
import type { AIToolExecutor } from 'types/ai';
import type { MemoryCategory, MemorySection } from '@/ai/memory/types';
import { MEMORY_CATEGORIES } from '@/ai/memory/types';
import { useMemoryStore } from '@/stores/ai/memory';
import { createToolFailureResult, createToolSuccessResult } from '../../results';

export const EDIT_MEMORY_TOOL_NAME = 'edit_memory';

const MAX_ITEMS_PER_SECTION = 20;

type EditMemoryAction = 'add' | 'update' | 'remove';

function getSectionsSnapshot(store: ReturnType<typeof useMemoryStore>) {
  return store.doc.sections.map((s: MemorySection) => ({
    category: s.category,
    items: s.items.map((i) => i.content),
    count: s.items.length
  }));
}

function resolveTargetIndex(section: MemorySection, index: number | undefined, content: string): number {
  if (index !== undefined && index >= 0 && index < section.items.length) return index;
  if (content?.trim()) return section.items.findIndex((i) => i.content === content.trim());
  return -1;
}

export function createBuiltinEditMemoryTool(): AIToolExecutor<{
  action: EditMemoryAction;
  section: MemoryCategory;
  content?: string;
  index?: number;
}> {
  return {
    definition: {
      name: EDIT_MEMORY_TOOL_NAME,
      description:
        '修改用户记忆文件（~/.tibis/MEMORY.md）。你已经通过 system prompt 持有当前记忆内容，直接决定 add/update/remove。' +
        '若新内容与已有条目属同类信息（如名字），必须 update 而非 add。单分区最多 20 条。',
      source: 'builtin',
      riskLevel: 'write',
      safeAutoApprove: true,
      requiresActiveDocument: false,
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['add', 'update', 'remove'],
            description: 'add=新增, update=替换已有条目, remove=删除'
          },
          section: {
            type: 'string',
            enum: MEMORY_CATEGORIES,
            description: '目标分区'
          },
          content: {
            type: 'string',
            description: '记忆内容。add/update 必填，remove 按此精确匹配'
          },
          index: {
            type: 'number',
            description: '条目索引（0 开始）。update/remove 优先使用此项'
          }
        },
        required: ['action', 'section'],
        additionalProperties: false
      }
    },

    async execute(input) {
      const { action, section, content, index } = input;
      const store = useMemoryStore();
      if (!store.loaded) await store.loadMemory();

      const target = store.doc.sections.find((s) => s.category === section);
      if (!target) {
        return createToolFailureResult(EDIT_MEMORY_TOOL_NAME, 'INVALID_INPUT', `无效分区：${section}`);
      }

      if (action === 'add') {
        const text = content?.trim();
        if (!text) return createToolFailureResult(EDIT_MEMORY_TOOL_NAME, 'INVALID_INPUT', 'add 需要 content');
        if (target.items.some((i) => i.content === text)) {
          return createToolSuccessResult(EDIT_MEMORY_TOOL_NAME, {
            action: 'add',
            summary: `「${text}」已存在，未重复添加。`,
            sections: getSectionsSnapshot(store)
          });
        }
        if (target.items.length >= MAX_ITEMS_PER_SECTION) {
          return createToolFailureResult(EDIT_MEMORY_TOOL_NAME, 'EXECUTION_FAILED', `${section} 已满 ${MAX_ITEMS_PER_SECTION} 条`);
        }
        target.items.push({ content: text });
        await store.saveMemory();
        return createToolSuccessResult(EDIT_MEMORY_TOOL_NAME, {
          action: 'add',
          summary: `已添加「${text}」到 ${section}（${target.items.length}/${MAX_ITEMS_PER_SECTION}）`,
          sections: getSectionsSnapshot(store)
        });
      }

      if (action === 'update') {
        const text = content?.trim();
        if (!text) return createToolFailureResult(EDIT_MEMORY_TOOL_NAME, 'INVALID_INPUT', 'update 需要 content');
        const i = resolveTargetIndex(target, index, content!);
        if (i === -1) return createToolFailureResult(EDIT_MEMORY_TOOL_NAME, 'INVALID_INPUT', `在 ${section} 中未找到匹配条目`);
        const old = target.items[i].content;
        target.items[i] = { content: text };
        await store.saveMemory();
        return createToolSuccessResult(EDIT_MEMORY_TOOL_NAME, {
          action: 'update',
          summary: `${section}: 「${old}」→「${text}」`,
          sections: getSectionsSnapshot(store)
        });
      }

      if (action === 'remove') {
        const i = resolveTargetIndex(target, index, content || '');
        if (i === -1) return createToolFailureResult(EDIT_MEMORY_TOOL_NAME, 'INVALID_INPUT', `在 ${section} 中未找到匹配条目`);
        const removed = target.items[i].content;
        target.items.splice(i, 1);
        await store.saveMemory();
        return createToolSuccessResult(EDIT_MEMORY_TOOL_NAME, {
          action: 'remove',
          summary: `已从 ${section} 删除「${removed}」`,
          sections: getSectionsSnapshot(store)
        });
      }

      return createToolFailureResult(EDIT_MEMORY_TOOL_NAME, 'INVALID_INPUT', `不支持的操作：${action}`);
    }
  };
}
