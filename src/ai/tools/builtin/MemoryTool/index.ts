/**
 * @file MemoryTool/index.ts
 * @description 记忆管理工具，拆分为 read_memory（只读）和 edit_memory（只写），
 * 强制 AI 先读后写，避免跳过 read 直接 add 导致冲突。
 */
import type { AIToolExecutor } from 'types/ai';
import type { MemoryCategory, MemorySection } from '@/ai/memory/types';
import { MEMORY_CATEGORIES } from '@/ai/memory/types';
import { useMemoryStore } from '@/stores/ai/memory';
import { createToolFailureResult, createToolSuccessResult } from '../../results';

/** 记忆读取工具名称 */
export const READ_MEMORY_TOOL_NAME = 'read_memory';

/** 记忆编辑工具名称 */
export const EDIT_MEMORY_TOOL_NAME = 'edit_memory';

/** 单分区最大条目数 */
const MAX_ITEMS_PER_SECTION = 20;

/** 编辑操作 */
type EditMemoryAction = 'add' | 'update' | 'remove';

/**
 * 获取分区快照（简化版，供结果返回）
 */
function getSectionsSnapshot(store: ReturnType<typeof useMemoryStore>): { category: string; items: string[]; count: number }[] {
  return store.doc.sections.map((s: MemorySection) => ({
    category: s.category,
    items: s.items.map((i) => i.content),
    count: s.items.length
  }));
}

/**
 * 确定要操作的目标条目索引（仅精确匹配 + 显式索引）
 */
function resolveTargetIndex(section: MemorySection, index: number | undefined, content: string): number {
  if (index !== undefined && index >= 0 && index < section.items.length) {
    return index;
  }
  if (content && content.trim().length > 0) {
    return section.items.findIndex((item) => item.content === content.trim());
  }
  return -1;
}

// ══════════════════════ read_memory ══════════════════════

/**
 * 创建记忆读取工具（只读，低风险）
 */
export function createBuiltinReadMemoryTool(): AIToolExecutor {
  return {
    definition: {
      name: READ_MEMORY_TOOL_NAME,
      description: '读取用户记忆文件，返回所有分区的当前条目。在修改记忆前必须先调用此工具了解现状。',
      source: 'builtin',
      riskLevel: 'read',
      safeAutoApprove: true,
      requiresActiveDocument: false,
      parameters: {
        type: 'object',
        properties: {},
        additionalProperties: false
      }
    },

    async execute() {
      const store = useMemoryStore();
      if (!store.loaded) {
        await store.loadMemory();
      }

      return createToolSuccessResult(READ_MEMORY_TOOL_NAME, {
        sections: store.doc.sections.map((s: MemorySection) => ({
          category: s.category,
          items: s.items.map((i) => i.content),
          count: s.items.length
        })),
        summary: `共 ${store.totalItemCount} 条记忆，分布在 ${store.nonEmptySections.length} 个分区。`
      });
    }
  };
}

// ══════════════════════ edit_memory ══════════════════════

/**
 * edit_memory 输入参数
 */
interface EditMemoryInput {
  action: EditMemoryAction;
  section: MemoryCategory;
  content?: string;
  index?: number;
}

/**
 * 创建记忆编辑工具（只写，高风险）
 */
export function createBuiltinEditMemoryTool(): AIToolExecutor<EditMemoryInput> {
  return {
    definition: {
      name: EDIT_MEMORY_TOOL_NAME,
      description:
        '修改用户记忆文件。必须先调用 read_memory 了解现有条目，再决定 add/update/remove。' +
        '若新内容与已有条目属同类信息（如名字、项目名），必须用 update 替换而非 add。单分区最多 20 条。',
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
            description: 'add：新增条目（同类信息已存在时请用 update）。update：替换已有条目（需先 read_memory 获取 index）。remove：删除条目。'
          },
          section: {
            type: 'string',
            enum: MEMORY_CATEGORIES,
            description:
              '目标分区：Instructions（规则约束）、Preferences（输出偏好）、Habits（工作习惯）、Facts（事实信息）、Projects（项目描述）、Current Context（当前事项）。'
          },
          content: {
            type: 'string',
            description: '记忆内容文本。add/update 时必填，remove 时按此内容精确匹配（建议先 read_memory 确认）。'
          },
          index: {
            type: 'number',
            description: '目标条目索引（从 0 开始）。update/remove 时优先使用此项，比 content 匹配更精确。先 read_memory 获取。'
          }
        },
        required: ['action', 'section'],
        additionalProperties: false
      }
    },

    async execute(input: EditMemoryInput) {
      const { action, section, content, index } = input;
      const store = useMemoryStore();

      if (!store.loaded) {
        await store.loadMemory();
      }

      const targetSection = store.doc.sections.find((s: MemorySection) => s.category === section);
      if (!targetSection) {
        return createToolFailureResult(EDIT_MEMORY_TOOL_NAME, 'INVALID_INPUT', `无效的分区名称：${section}。`);
      }

      // add
      if (action === 'add') {
        if (!content || content.trim().length === 0) {
          return createToolFailureResult(EDIT_MEMORY_TOOL_NAME, 'INVALID_INPUT', 'add 需要提供非空的 content。');
        }

        // 精确去重
        if (targetSection.items.some((item) => item.content === content.trim())) {
          return createToolSuccessResult(EDIT_MEMORY_TOOL_NAME, {
            action: 'add',
            summary: `「${content.trim()}」已存在于 ${section} 分区，未重复添加。`,
            sections: getSectionsSnapshot(store)
          });
        }

        // 上限
        if (targetSection.items.length >= MAX_ITEMS_PER_SECTION) {
          return createToolFailureResult(
            EDIT_MEMORY_TOOL_NAME,
            'EXECUTION_FAILED',
            `${section} 分区已达上限 ${MAX_ITEMS_PER_SECTION} 条。请先 remove 旧条目。`
          );
        }

        targetSection.items.push({ content: content.trim() });
        await store.saveMemory();

        return createToolSuccessResult(EDIT_MEMORY_TOOL_NAME, {
          action: 'add',
          summary: `已向 ${section} 添加「${content.trim()}」（${targetSection.items.length}/${MAX_ITEMS_PER_SECTION} 条）。`,
          sections: getSectionsSnapshot(store)
        });
      }

      // update
      if (action === 'update') {
        if (!content || content.trim().length === 0) {
          return createToolFailureResult(EDIT_MEMORY_TOOL_NAME, 'INVALID_INPUT', 'update 需要提供非空的 content。');
        }

        const targetIndex = resolveTargetIndex(targetSection, index, content);
        if (targetIndex === -1) {
          return createToolFailureResult(
            EDIT_MEMORY_TOOL_NAME,
            'INVALID_INPUT',
            `在 ${section} 中未找到匹配「${content.trim()}」的条目。请先 read_memory 查看列表再用 index 操作。`
          );
        }

        const oldContent = targetSection.items[targetIndex].content;
        targetSection.items[targetIndex] = { content: content.trim() };
        await store.saveMemory();

        return createToolSuccessResult(EDIT_MEMORY_TOOL_NAME, {
          action: 'update',
          summary: `已将 ${section} 的「${oldContent}」更新为「${content.trim()}」。`,
          sections: getSectionsSnapshot(store)
        });
      }

      // remove
      if (action === 'remove') {
        const targetIndex = resolveTargetIndex(targetSection, index, content || '');
        if (targetIndex === -1) {
          return createToolFailureResult(EDIT_MEMORY_TOOL_NAME, 'INVALID_INPUT', `在 ${section} 中未找到匹配条目。请先 read_memory 查看列表再用 index 操作。`);
        }

        const removedContent = targetSection.items[targetIndex].content;
        targetSection.items.splice(targetIndex, 1);
        await store.saveMemory();

        return createToolSuccessResult(EDIT_MEMORY_TOOL_NAME, {
          action: 'remove',
          summary: `已从 ${section} 删除「${removedContent}」（剩余 ${targetSection.items.length} 条）。`,
          sections: getSectionsSnapshot(store)
        });
      }

      return createToolFailureResult(EDIT_MEMORY_TOOL_NAME, 'INVALID_INPUT', `不支持的操作：${action}。`);
    }
  };
}
