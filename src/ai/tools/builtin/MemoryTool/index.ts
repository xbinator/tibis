/**
 * @file MemoryTool/index.ts
 * @description 记忆管理工具，让对话 AI 能直接读取和修改用户的 MEMORY.md
 */
import type { AIToolExecutor } from 'types/ai';
import type { MemoryCategory, MemorySection } from '@/ai/memory/types';
import { MEMORY_CATEGORIES } from '@/ai/memory/types';
import { useMemoryStore } from '@/stores/ai/memory';
import { createToolFailureResult, createToolSuccessResult } from '../../results';

/** 记忆管理工具名称 */
export const EDIT_MEMORY_TOOL_NAME = 'edit_memory';

/** 单分区最大条目数 */
const MAX_ITEMS_PER_SECTION = 20;

/** 支持的操作 */
const VALID_ACTIONS = ['read', 'add', 'update', 'remove'] as const;

/** 操作类型 */
type EditMemoryAction = (typeof VALID_ACTIONS)[number];

/**
 * 记忆管理工具输入参数
 */
interface EditMemoryInput {
  /** 操作类型 */
  action: EditMemoryAction;
  /** 目标分区（add/update/remove 时必填） */
  section?: MemoryCategory;
  /** 记忆内容（add/update 时必填，remove 时按内容精确匹配） */
  content?: string;
  /** 条目索引（update/remove 时可选，不传则按 content 精确匹配） */
  index?: number;
}

/**
 * 记忆管理工具结果
 */
interface EditMemoryResult {
  /** 执行的操作 */
  action: EditMemoryAction;
  /** 操作后各分区及其条目 */
  sections: { category: string; items: string[]; count: number }[];
  /** 操作摘要 */
  summary: string;
}

/**
 * 获取分区快照（简化版，供结果返回）
 * @param store - 记忆 store 实例
 * @returns 分区条目列表
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
 * @param section - 目标分区
 * @param index - 用户指定的索引
 * @param content - 用于精确匹配的内容
 * @returns 条目索引，-1 表示未找到
 */
function resolveTargetIndex(section: MemorySection, index: number | undefined, content: string): number {
  // 优先使用显式索引
  if (index !== undefined && index >= 0 && index < section.items.length) {
    return index;
  }

  // 精确匹配
  if (content && content.trim().length > 0) {
    const trimmed = content.trim();
    return section.items.findIndex((item) => item.content === trimmed);
  }

  return -1;
}

/**
 * 创建记忆管理工具
 * @returns 记忆管理工具执行器
 */
export function createBuiltinMemoryTool(): AIToolExecutor<EditMemoryInput, EditMemoryResult> {
  return {
    definition: {
      name: EDIT_MEMORY_TOOL_NAME,
      description:
        '管理用户记忆文件（~/.tibis/MEMORY.md）。当你在对话中发现用户的偏好、习惯、重要事实或当前工作上下文时，主动使用此工具保存。' +
        '用户明确要求记住某事时也使用。支持 read/add/update/remove 四种操作。' +
        '注意：update 和 remove 需要先 read 获取条目内容或索引再操作。单分区最多 20 条。',
      source: 'builtin',
      riskLevel: 'write',
      safeAutoApprove: true,
      requiresActiveDocument: false,
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: VALID_ACTIONS,
            description: '操作类型：read（读取当前所有记忆）、add（新增条目）、update（更新条目）、remove（删除条目）。'
          },
          section: {
            type: 'string',
            enum: MEMORY_CATEGORIES,
            description:
              '目标分区：Instructions（规则约束）、Preferences（输出偏好）、Habits（工作习惯）、Facts（事实信息）、Projects（项目描述）、Current Context（当前事项）。add/update/remove 时必填。'
          },
          content: {
            type: 'string',
            description: '记忆内容文本。add/update 时必填，remove 时按此内容精确匹配要删除的条目（建议先 read 确认）。read 时忽略。'
          },
          index: {
            type: 'number',
            description: '目标条目在分区中的索引（从 0 开始）。update/remove 时可选，不传则按 content 精确匹配。建议先 read 获取索引后再操作。read/add 时忽略。'
          }
        },
        required: ['action'],
        additionalProperties: false
      }
    },

    async execute(input: EditMemoryInput) {
      const { action, section, content, index } = input;
      const store = useMemoryStore();

      // 确保 Store 已加载记忆
      if (!store.loaded) {
        await store.loadMemory();
      }

      // 读取操作
      if (action === 'read') {
        return createToolSuccessResult<EditMemoryResult>(EDIT_MEMORY_TOOL_NAME, {
          action: 'read',
          summary: `共 ${store.totalItemCount} 条记忆，分布在 ${store.nonEmptySections.length} 个分区。`,
          sections: getSectionsSnapshot(store)
        });
      }

      // 写操作需要分区参数
      if (!section) {
        return createToolFailureResult(EDIT_MEMORY_TOOL_NAME, 'INVALID_INPUT', 'add/update/remove 操作必须指定 section 参数。');
      }

      const targetSection = store.doc.sections.find((s: MemorySection) => s.category === section);

      if (!targetSection) {
        return createToolFailureResult(EDIT_MEMORY_TOOL_NAME, 'INVALID_INPUT', `无效的分区名称：${section}。`);
      }

      // 新增操作
      if (action === 'add') {
        if (!content || content.trim().length === 0) {
          return createToolFailureResult(EDIT_MEMORY_TOOL_NAME, 'INVALID_INPUT', 'add 操作需要提供非空的 content。');
        }

        // 检查是否已存在相同内容（精确匹配去重）
        const existingIndex = targetSection.items.findIndex((item) => item.content === content.trim());
        if (existingIndex !== -1) {
          return createToolSuccessResult<EditMemoryResult>(EDIT_MEMORY_TOOL_NAME, {
            action: 'add',
            summary: `内容「${content.trim()}」已存在于 ${section} 分区中（第 ${existingIndex + 1} 条），未重复添加。`,
            sections: getSectionsSnapshot(store)
          });
        }

        // 检查分区条目上限
        if (targetSection.items.length >= MAX_ITEMS_PER_SECTION) {
          return createToolFailureResult(
            EDIT_MEMORY_TOOL_NAME,
            'EXECUTION_FAILED',
            `${section} 分区已达上限 ${MAX_ITEMS_PER_SECTION} 条。请先移除一些旧条目后再添加。`
          );
        }

        targetSection.items.push({ content: content.trim() });
        await store.saveMemory();

        return createToolSuccessResult<EditMemoryResult>(EDIT_MEMORY_TOOL_NAME, {
          action: 'add',
          summary: `已向 ${section} 分区添加「${content.trim()}」（当前 ${targetSection.items.length}/${MAX_ITEMS_PER_SECTION} 条）。`,
          sections: getSectionsSnapshot(store)
        });
      }

      // 更新操作
      if (action === 'update') {
        if (!content || content.trim().length === 0) {
          return createToolFailureResult(EDIT_MEMORY_TOOL_NAME, 'INVALID_INPUT', 'update 操作需要提供非空的 content。');
        }

        const targetIndex = resolveTargetIndex(targetSection, index, content);

        if (targetIndex === -1) {
          return createToolFailureResult(
            EDIT_MEMORY_TOOL_NAME,
            'INVALID_INPUT',
            `在 ${section} 分区中未找到匹配「${content.trim()}」的条目。请先用 read 查看当前条目列表，再用 index 或精确 content 操作。`
          );
        }

        const oldContent = targetSection.items[targetIndex].content;
        targetSection.items[targetIndex] = { content: content.trim() };
        await store.saveMemory();

        return createToolSuccessResult<EditMemoryResult>(EDIT_MEMORY_TOOL_NAME, {
          action: 'update',
          summary: `已将 ${section} 分区的「${oldContent}」更新为「${content.trim()}」。`,
          sections: getSectionsSnapshot(store)
        });
      }

      // 删除操作
      if (action === 'remove') {
        const targetIndex = resolveTargetIndex(targetSection, index, content || '');

        if (targetIndex === -1) {
          return createToolFailureResult(
            EDIT_MEMORY_TOOL_NAME,
            'INVALID_INPUT',
            `在 ${section} 分区中未找到匹配「${content || ''}」的条目。请先用 read 查看当前条目列表，再用 index 或精确 content 操作。`
          );
        }

        const removedContent = targetSection.items[targetIndex].content;
        targetSection.items.splice(targetIndex, 1);
        await store.saveMemory();

        return createToolSuccessResult<EditMemoryResult>(EDIT_MEMORY_TOOL_NAME, {
          action: 'remove',
          summary: `已从 ${section} 分区删除「${removedContent}」（剩余 ${targetSection.items.length} 条）。`,
          sections: getSectionsSnapshot(store)
        });
      }

      return createToolFailureResult(EDIT_MEMORY_TOOL_NAME, 'INVALID_INPUT', `不支持的操作：${action}。`);
    }
  };
}
