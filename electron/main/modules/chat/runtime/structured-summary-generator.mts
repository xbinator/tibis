/**
 * @file structured-summary-generator.mts
 * @description ChatRuntime 主进程结构化摘要生成器。
 */
import type { ChatModelResolver } from './chat-model-resolver.mjs';
import type { JSONSchema7 } from 'json-schema';
import type { AIRequestOptions } from 'types/ai';
import type { StructuredConversationSummary } from 'types/compression';
import { isEmpty } from 'lodash-es';

/** 摘要生成系统提示词。 */
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

/** Runtime 规则裁剪消息项。 */
export interface RuntimeTrimmedMessageItem {
  /** 原始消息 ID。 */
  messageId: string;
  /** 消息角色。 */
  role: 'user' | 'assistant';
  /** 裁剪后的文本。 */
  trimmedText: string;
}

/** Runtime 摘要生成输入。 */
export interface RuntimeGenerateStructuredSummaryInput {
  /** 规则裁剪后的消息项。 */
  items: RuntimeTrimmedMessageItem[];
  /** 上一条压缩记录上下文。 */
  previousRecord?: {
    /** 压缩摘要文本。 */
    recordText: string;
    /** 结构化摘要。 */
    structuredSummary: StructuredConversationSummary;
    /** 通用长聊天摘要视图。 */
    generalSummary?: unknown;
  };
}

/** Runtime 摘要 AI 调用函数。 */
export type RuntimeSummaryInvoke = (request: AIRequestOptions) => Promise<{ text: string; output?: unknown }>;

/** Runtime 摘要 AI 服务调用函数。 */
export type RuntimeSummaryGenerateText = (
  createOptions: NonNullable<Awaited<ReturnType<ChatModelResolver['resolve']>>>['createOptions'],
  request: AIRequestOptions
) => Promise<[unknown] | [undefined, { text: string; output?: unknown }]>;

/** Runtime 结构化摘要生成器。 */
export interface RuntimeStructuredSummaryGenerator {
  /**
   * 生成结构化摘要。
   * @param input - 摘要生成输入
   * @returns 结构化摘要
   */
  generate(input: RuntimeGenerateStructuredSummaryInput): Promise<StructuredConversationSummary>;
}

/** Runtime 摘要生成器依赖。 */
export interface RuntimeStructuredSummaryGeneratorDependencies {
  /** AI 调用函数。 */
  invoke?: RuntimeSummaryInvoke;
}

/**
 * 创建 runtime 摘要 AI 调用 adapter。
 * @param resolver - chat 模型解析器
 * @param generateText - AI 服务文本生成函数
 * @returns 摘要调用函数
 */
export function createRuntimeSummaryInvoke(resolver: ChatModelResolver, generateText: RuntimeSummaryGenerateText): RuntimeSummaryInvoke {
  return async (request: AIRequestOptions): Promise<{ text: string; output?: unknown }> => {
    const resolution = await resolver.resolve();
    if (!resolution) {
      throw new Error('No available summary model');
    }

    const [, result] = await generateText(resolution.createOptions, {
      ...request,
      modelId: resolution.modelId
    });

    if (!result) {
      throw new Error('Summary model invocation failed');
    }

    return {
      text: result.text,
      output: result.output
    };
  };
}

/** 会话摘要结构化输出 schema。 */
const STRUCTURED_SUMMARY_SCHEMA: JSONSchema7 = {
  type: 'object',
  properties: {
    goal: { type: 'string' },
    recentTopic: { type: 'string' },
    userPreferences: { type: 'array', items: { type: 'string' } },
    constraints: { type: 'array', items: { type: 'string' } },
    decisions: { type: 'array', items: { type: 'string' } },
    importantFacts: { type: 'array', items: { type: 'string' } },
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
    openQuestions: { type: 'array', items: { type: 'string' } },
    pendingActions: { type: 'array', items: { type: 'string' } }
  },
  required: ['goal', 'recentTopic', 'userPreferences', 'constraints', 'decisions', 'importantFacts', 'fileContext', 'openQuestions', 'pendingActions'],
  additionalProperties: false
};

/**
 * 构建摘要生成用户提示词。
 * @param input - 摘要生成输入
 * @returns 用户提示词
 */
function buildSummaryUserPrompt(input: RuntimeGenerateStructuredSummaryInput): string {
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
 * 清理摘要 fallback 使用的文本。
 * @param text - 原始消息文本
 * @returns 规范化后的消息文本
 */
function normalizeFallbackText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * 截断 fallback 需求文本。
 * @param text - 规范化后的用户需求文本
 * @returns 可写入结构化摘要的重要事实文本
 */
function truncateFallbackRequirement(text: string): string {
  if (text.length <= FALLBACK_REQUIREMENT_MAX_CHARS) return text;

  return `${text.slice(0, FALLBACK_REQUIREMENT_MAX_CHARS)}...`;
}

/**
 * 从用户消息中提取 fallback 可用的原始需求文本。
 * @param items - 裁剪后的消息项
 * @returns 用户需求文本列表
 */
function extractFallbackUserRequirements(items: RuntimeTrimmedMessageItem[]): string[] {
  return items
    .filter((item) => item.role === 'user')
    .map((item) => normalizeFallbackText(item.trimmedText))
    .filter((text) => text.length > 0)
    .map(truncateFallbackRequirement);
}

/**
 * 将用户显式需求合并回模型摘要。
 * @param summary - 模型生成摘要
 * @param items - 裁剪消息项
 * @returns 合并后的摘要
 */
function mergeExplicitRequirements(summary: StructuredConversationSummary, items: RuntimeTrimmedMessageItem[]): StructuredConversationSummary {
  const requirements = extractFallbackUserRequirements(items);
  if (!requirements.length) return summary;

  const requirementFacts = requirements.map((requirement) => `用户原始需求：${requirement}`);
  return {
    ...summary,
    importantFacts: [...summary.importantFacts, ...requirementFacts],
    pendingActions: [...summary.pendingActions, '继续按用户原始需求完成后续查询、整理、排序或输出']
  };
}

/**
 * 生成 fallback 默认摘要。
 * @param items - 裁剪后的消息项
 * @returns fallback 结构化摘要
 */
export function generateRuntimeFallbackSummary(items: RuntimeTrimmedMessageItem[]): StructuredConversationSummary {
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
 * 判断对象是否是完整结构化摘要。
 * @param value - 待检查值
 * @returns 是否是结构化摘要
 */
function isStructuredConversationSummary(value: unknown): value is StructuredConversationSummary {
  if (!value || typeof value !== 'object') return false;

  const source = value as Partial<StructuredConversationSummary>;
  return (
    typeof source.goal === 'string' &&
    typeof source.recentTopic === 'string' &&
    Array.isArray(source.userPreferences) &&
    Array.isArray(source.constraints) &&
    Array.isArray(source.decisions) &&
    Array.isArray(source.importantFacts) &&
    Array.isArray(source.fileContext) &&
    Array.isArray(source.openQuestions) &&
    Array.isArray(source.pendingActions)
  );
}

/**
 * 从模型文本中解析 JSON 摘要。
 * @param text - 模型文本
 * @returns 结构化摘要
 */
function parseSummaryFromText(text: string): StructuredConversationSummary | undefined {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return undefined;

  try {
    const summary = JSON.parse(jsonMatch[0]) as unknown;
    return isStructuredConversationSummary(summary) ? summary : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 创建主进程结构化摘要生成器。
 * @param dependencies - 生成器依赖
 * @returns 结构化摘要生成器
 */
export function createRuntimeStructuredSummaryGenerator(dependencies: RuntimeStructuredSummaryGeneratorDependencies = {}): RuntimeStructuredSummaryGenerator {
  return {
    async generate(input: RuntimeGenerateStructuredSummaryInput): Promise<StructuredConversationSummary> {
      if (!dependencies.invoke) {
        return generateRuntimeFallbackSummary(input.items);
      }

      try {
        const result = await dependencies.invoke({
          modelId: '',
          messages: [
            { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
            { role: 'user', content: buildSummaryUserPrompt(input) }
          ],
          temperature: 0.3,
          output: {
            schema: STRUCTURED_SUMMARY_SCHEMA,
            name: 'conversation_summary',
            description: 'Structured summary for compressed chat history context'
          }
        });

        const outputSummary = isStructuredConversationSummary(result.output) ? result.output : undefined;
        const parsedSummary = outputSummary ?? parseSummaryFromText(result.text);

        if (parsedSummary && !isEmpty(parsedSummary.goal) && !isEmpty(parsedSummary.recentTopic)) {
          return mergeExplicitRequirements(parsedSummary, input.items);
        }
      } catch {
        return generateRuntimeFallbackSummary(input.items);
      }

      return generateRuntimeFallbackSummary(input.items);
    }
  };
}
