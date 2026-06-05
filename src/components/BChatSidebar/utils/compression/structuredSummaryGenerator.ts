/**
 * @file structuredSummaryGenerator.ts
 * @description AI 摘要生成器，负责调用摘要模型生成结构化摘要。
 */
import type { GenerateStructuredSummaryInput, StructuredConversationSummary, TrimmedMessageItem } from './types';
import type { JSONSchema7 } from 'json-schema';
import { isEmpty } from 'lodash-es';
import { getElectronAPI } from '@/shared/platform/electron-api';
import { providerStorage, serviceModelsStorage } from '@/shared/storage';

/**
 * 摘要生成的系统提示词模板。
 */
const SUMMARY_SYSTEM_PROMPT = `你是一个专业的对话摘要助手。你的任务是将对话历史压缩为结构化摘要。

请严格按照以下 JSON 格式输出摘要，不要包含任何其他文本：
{
  "goal": "用户的主要目标（一句话）",
  "recentTopic": "最近讨论的话题",
  "userPreferences": ["用户偏好1", "用户偏好2"],
  "constraints": ["约束条件1", "约束条件2"],
  "decisions": ["已做出的决策1", "已做出的决策2"],
  "importantFacts": ["重要事实1", "重要事实2"],
  "fileContext": [],
  "openQuestions": ["待解决问题1", "待解决问题2"],
  "pendingActions": ["待处理操作1", "待处理操作2"]
}

注意事项：
1. 只输出 JSON，不要包含任何解释性文本
2. 如果某个字段没有内容，使用空数组 []
3. 提取关键信息，避免冗余描述
4. 保持客观，不要添加主观判断
5. 必须保留用户明确给出的 ID、代码、编号、文件名、URL、表格字段、排序规则、输出格式和操作要求，不得只概括为话题
6. 当用户给出待处理清单时，将完整清单放入 importantFacts，将仍需执行的任务放入 pendingActions
7. 对通用长聊天必须保留对话连续性：用户偏好、语气边界、长期主线、最近转折和用户期待的互动方式
8. 用户原始需求、清单、编号、数字、路径、URL、排序规则和输出格式必须进入 importantFacts，且保留原文中的关键标识符
9. openQuestions 和 pendingActions 表示未完成事项；如果上一条摘要中的问题在新对话中已经明确回答、取消或替代，必须移除旧项，只保留仍需继续的事项`;

/** fallback 摘要中保留用户原始需求的最大字符数。 */
const FALLBACK_REQUIREMENT_MAX_CHARS = 1_200;

/**
 * 会话摘要结构化输出 schema。
 */
const STRUCTURED_SUMMARY_SCHEMA: JSONSchema7 = {
  type: 'object',
  properties: {
    goal: { type: 'string' },
    recentTopic: { type: 'string' },
    userPreferences: {
      type: 'array',
      items: { type: 'string' }
    },
    constraints: {
      type: 'array',
      items: { type: 'string' }
    },
    decisions: {
      type: 'array',
      items: { type: 'string' }
    },
    importantFacts: {
      type: 'array',
      items: { type: 'string' }
    },
    fileContext: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          filePath: { type: 'string' },
          startLine: { type: 'number' },
          endLine: { type: 'number' },
          userIntent: { type: 'string' },
          keySnippetSummary: { type: 'string' },
          shouldReloadOnDemand: { type: 'boolean' }
        },
        required: ['filePath', 'userIntent', 'keySnippetSummary', 'shouldReloadOnDemand'],
        additionalProperties: false
      }
    },
    openQuestions: {
      type: 'array',
      items: { type: 'string' }
    },
    pendingActions: {
      type: 'array',
      items: { type: 'string' }
    }
  },
  required: ['goal', 'recentTopic', 'userPreferences', 'constraints', 'decisions', 'importantFacts', 'fileContext', 'openQuestions', 'pendingActions'],
  additionalProperties: false
};

/**
 * 构建摘要生成的用户提示词，增量模式下包含上一条压缩记录上下文。
 * @param input - 摘要生成输入
 * @returns 用户提示词字符串
 */
function buildSummaryUserPrompt(input: GenerateStructuredSummaryInput): string {
  const conversationText = input.items.map((item) => `[${item.role}]: ${item.trimmedText}`).join('\n\n');
  const previousRecordText = input.previousRecord
    ? [
        input.previousRecord.recordText,
        JSON.stringify({
          structuredSummary: input.previousRecord.structuredSummary,
          generalSummary: input.previousRecord.generalSummary
        })
      ].join('\n')
    : '无';

  return ['PREVIOUS_COMPRESSION_RECORD:', previousRecordText, '', 'CONVERSATION_CONTENT:', conversationText, '', '请生成 JSON 格式的结构化摘要。'].join('\n');
}

/**
 * 获取压缩记录生成所使用的模型配置。
 * 统一使用当前聊天模型配置。
 */
async function getCompressionModelConfig(): Promise<{ providerId: string; modelId: string } | null> {
  const chatConfig = await serviceModelsStorage.getConfig('chat');
  if (chatConfig?.providerId && chatConfig?.modelId) {
    const provider = await providerStorage.getProvider(chatConfig.providerId);
    if (provider?.isEnabled) {
      return {
        providerId: chatConfig.providerId,
        modelId: chatConfig.modelId
      };
    }
  }

  return null;
}

/**
 * 清理摘要 fallback 使用的文本，压平空白但保留用户给出的标识符和字段。
 * @param text - 原始消息文本
 * @returns 规范化后的消息文本
 */
function normalizeFallbackText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * 截断 fallback 需求文本，优先保留开头的完整用户清单和要求。
 * @param text - 规范化后的用户需求文本
 * @returns 可写入结构化摘要的重要事实文本
 */
function truncateFallbackRequirement(text: string): string {
  if (text.length <= FALLBACK_REQUIREMENT_MAX_CHARS) {
    return text;
  }

  return `${text.slice(0, FALLBACK_REQUIREMENT_MAX_CHARS)}...`;
}

/**
 * 从用户消息中提取 fallback 可用的原始需求文本。
 * @param items - 裁剪后的消息项
 * @returns 用户需求文本列表
 */
function extractFallbackUserRequirements(items: TrimmedMessageItem[]): string[] {
  return items
    .filter((item) => item.role === 'user')
    .map((item) => normalizeFallbackText(item.trimmedText))
    .filter((text) => text.length > 0)
    .map(truncateFallbackRequirement);
}

/**
 * 将用户显式需求合并回模型摘要，防止摘要模型过度概括导致代码清单和输出要求丢失。
 * @param summary - 模型生成的结构化摘要
 * @param items - 裁剪后的消息项
 * @returns 合并了原始需求摘录的结构化摘要
 */
function mergeExplicitRequirements(summary: StructuredConversationSummary, items: TrimmedMessageItem[]): StructuredConversationSummary {
  const requirements = extractFallbackUserRequirements(items);
  if (!requirements.length) {
    return summary;
  }

  const requirementFacts = requirements.map((requirement) => `用户原始需求：${requirement}`);
  return {
    ...summary,
    importantFacts: [...summary.importantFacts, ...requirementFacts],
    pendingActions: [...summary.pendingActions, '继续按用户原始需求完成后续查询、整理、排序或输出']
  };
}

/**
 * 生成降级的默认摘要（当 AI 调用失败时使用）。
 * fallback 不能只保留话题，否则压缩后会丢失用户给出的代码、字段和待办要求。
 * @param items - 裁剪后的消息项
 * @returns 结构化摘要
 */
function generateFallbackSummary(items: TrimmedMessageItem[]): StructuredConversationSummary {
  const requirements = extractFallbackUserRequirements(items);
  const recentTopic = requirements[0]?.slice(0, 120) ?? '无明确话题';

  return {
    goal: requirements[0] ? '保留并继续处理用户已提出的具体需求' : '用户正在进行对话',
    recentTopic,
    userPreferences: [],
    constraints: [],
    decisions: [],
    importantFacts: requirements.map((requirement) => `用户原始需求：${requirement}`),
    fileContext: [],
    openQuestions: [],
    pendingActions: requirements.length ? ['继续按用户原始需求完成后续查询、整理、排序或输出'] : []
  };
}

/**
 * 调用 AI 模型生成结构化摘要。
 * @param input - 摘要生成输入，包含裁剪后的消息项和可选的上一轮摘要
 * @returns 结构化摘要，失败时返回降级摘要
 */
export async function generateStructuredSummary(input: GenerateStructuredSummaryInput): Promise<StructuredConversationSummary> {
  const config = await getCompressionModelConfig();
  if (!config) {
    return generateFallbackSummary(input.items);
  }

  const provider = await providerStorage.getProvider(config.providerId);
  if (!provider) {
    return generateFallbackSummary(input.items);
  }

  const userPrompt = buildSummaryUserPrompt(input);

  try {
    const electronAPI = getElectronAPI();
    const [error, result] = await electronAPI.aiInvoke(
      {
        providerId: provider.id,
        providerName: provider.name,
        apiKey: provider.apiKey ?? '',
        baseUrl: provider.baseUrl ?? '',
        providerType: provider.type
      },
      {
        modelId: config.modelId,
        messages: [
          { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        output: {
          schema: STRUCTURED_SUMMARY_SCHEMA,
          name: 'conversation_summary',
          description: 'Structured summary for compressed chat history context'
        }
      }
    );

    if (error) {
      return generateFallbackSummary(input.items);
    }

    if (result.output && typeof result.output === 'object') {
      const structuredResult = result.output as StructuredConversationSummary;
      if (!isEmpty(structuredResult.goal) && !isEmpty(structuredResult.recentTopic)) {
        return mergeExplicitRequirements(structuredResult, input.items);
      }
    }

    // 解析 JSON 响应
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return generateFallbackSummary(input.items);
    }

    const summary = JSON.parse(jsonMatch[0]) as StructuredConversationSummary;

    // 验证必需字段
    if (isEmpty(summary.goal) || isEmpty(summary.recentTopic)) {
      return generateFallbackSummary(input.items);
    }

    return mergeExplicitRequirements(summary, input.items);
  } catch (error) {
    return generateFallbackSummary(input.items);
  }
}

/**
 * 生成可读性摘要文本。
 */
export function generateSummaryText(summary: StructuredConversationSummary): string {
  const parts: string[] = [];

  parts.push(`目标：${summary.goal}`);
  parts.push(`话题：${summary.recentTopic}`);

  if (!isEmpty(summary.userPreferences)) {
    parts.push(`用户偏好：${summary.userPreferences.join('、')}`);
  }

  if (!isEmpty(summary.decisions)) {
    parts.push(`已做决策：${summary.decisions.join('、')}`);
  }

  if (!isEmpty(summary.importantFacts)) {
    parts.push(`重要事实：${summary.importantFacts.join('、')}`);
  }

  if (!isEmpty(summary.openQuestions)) {
    parts.push(`待解决问题：${summary.openQuestions.join('、')}`);
  }

  if (!isEmpty(summary.pendingActions)) {
    parts.push(`待处理操作：${summary.pendingActions.join('、')}`);
  }

  return parts.join('\n');
}
