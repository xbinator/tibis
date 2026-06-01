/**
 * @file useMemory.ts
 * @description 记忆内容 AI 整理 Hook，负责调用 AI 将用户输入的增量内容与已有记忆合并整理并持久化。
 */
import type { AIOutputOptions } from 'types/ai';
import { ref } from 'vue';
import { message } from 'ant-design-vue';
import { serializeMemoryDoc } from '@/ai/memory/parser';
import type { MemoryCategory, MemoryDoc } from '@/ai/memory/types';
import { MEMORY_CATEGORIES } from '@/ai/memory/types';
import { useChat } from '@/hooks/useChat';
import { useMemoryStore } from '@/stores/ai/memory';
import { useServiceModelStore } from '@/stores/ai/serviceModel';

/** AI 整理记忆内容的 system prompt */
const MEMORY_ORGANIZE_SYSTEM_PROMPT = `你是一个记忆内容整理助手。用户的记忆文件采用以下分区结构：

- Instructions：规则条目（如编码规范、约束条件）
- Preferences：偏好条目（如语言、代码风格）
- Habits：习惯条目（如常用工具、流程偏好）
- Facts：事实条目（如个人信息）
- Projects：项目条目（如正在开发的功能或系统）
- Current Context：近期事项条目（如当前任务）

你会收到两部分内容：
1. 【当前记忆】用户已有的记忆内容
2. 【用户新增/修改】用户本次输入的增量内容

请将增量内容合并到已有记忆中，整理为清晰、有条理的格式。要求：
1. 保持上述分区结构不变，不要新增或删除分区
2. 合并相似或重复的条目，避免信息冗余
3. 按逻辑重要性重新排列每个分区内的条目
4. 修正表述不清或语法错误的内容
5. 去除无意义的冗余信息，保持每条简洁精炼
6. 如果用户新增内容与已有条目冲突，以新增内容为准
7. 如果用户明确要求"忘记"某些内容，请从记忆中移除
8. 如果某个分区没有内容，保留该分区但 items 为空数组`;

/** 记忆分区名称列表，用于 JSON Schema 枚举 */
const CATEGORY_VALUES = MEMORY_CATEGORIES as unknown as string[];

/** 结构化输出 JSON Schema */
const MEMORY_OUTPUT_SCHEMA: AIOutputOptions = {
  name: 'memory_doc',
  description: '整理后的记忆文档',
  schema: {
    type: 'object',
    properties: {
      sections: {
        type: 'array',
        description: '记忆分区列表',
        items: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              enum: CATEGORY_VALUES,
              description: '分区名称'
            },
            items: {
              type: 'array',
              description: '该分区下的记忆条目',
              items: {
                type: 'object',
                properties: {
                  content: {
                    type: 'string',
                    description: '条目内容'
                  }
                },
                required: ['content']
              }
            }
          },
          required: ['category', 'items']
        }
      }
    },
    required: ['sections']
  }
};

/** 结构化输出的分区条目 */
interface OrganizedSection {
  category: MemoryCategory;
  items: { content: string }[];
}

/** 结构化输出的完整结果 */
interface OrganizedOutput {
  sections: OrganizedSection[];
}

/**
 * 将结构化输出转换为 MemoryDoc
 * @param output - AI 返回的结构化对象
 * @returns 记忆文档
 */
function toMemoryDoc(output: OrganizedOutput): MemoryDoc {
  return {
    sections: output.sections.map((section) => ({
      category: section.category,
      items: section.items.filter((item) => item.content.trim())
    }))
  };
}

/**
 * 记忆内容 AI 整理 Hook
 * 提供增量内容与已有记忆合并整理并保存的能力
 */
export function useMemory() {
  const memoryStore = useMemoryStore();
  const serviceModelStore = useServiceModelStore();
  const { agent } = useChat({});

  /** AI 整理进行中状态 */
  const organizing = ref(false);

  /**
   * 调用 AI 将增量内容与已有记忆合并整理后保存到磁盘
   * @param incrementalContent - 用户输入的增量内容（新增/修改/删除指令）
   * @returns 是否整理成功
   */
  async function organize(incrementalContent: string): Promise<boolean> {
    organizing.value = true;
    try {
      const config = await serviceModelStore.getAvailableServiceConfig('chat');
      if (!config) {
        message.warning('未找到可用的模型配置，请先配置服务商');
        return false;
      }

      // 构造用户消息：已有记忆 + 增量内容
      const currentMemory = serializeMemoryDoc(memoryStore.doc);
      const userMessage = `【当前记忆】\n${currentMemory || '（空）'}\n\n【用户新增/修改】\n${incrementalContent}`;

      const [error, result] = await agent.invoke({
        providerId: config.providerId,
        modelId: config.modelId,
        messages: [
          { role: 'system', content: MEMORY_ORGANIZE_SYSTEM_PROMPT },
          { role: 'user', content: userMessage }
        ],
        output: MEMORY_OUTPUT_SCHEMA
      });

      if (error) {
        message.error(error.message || 'AI 整理失败，请稍后重试');
        return false;
      }

      const organized = result?.output as OrganizedOutput | undefined;
      if (!organized?.sections) {
        message.warning('AI 未返回有效内容');
        return false;
      }

      const memoryDoc = toMemoryDoc(organized);
      memoryStore.doc = memoryDoc;
      await memoryStore.saveMemory();

      message.success('记忆内容整理完成');
      return true;
    } catch {
      message.error('AI 整理异常，请稍后重试');
      return false;
    } finally {
      organizing.value = false;
    }
  }

  return {
    /** AI 整理进行中状态 */
    organizing,
    /** 执行 AI 整理，返回是否成功 */
    organize
  };
}
