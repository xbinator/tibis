/**
 * @file summary-generator.mts
 * @description 使用当前会话模型从冻结源生成结构化上下文摘要。
 */
import type { CompactionSourceSnapshot } from './types.mjs';
import type { ChatModelResolution } from '../model/resolver.mjs';
import type { AICreateOptions, AIInvokeResult, AIRequestOptions, AIServiceError, AIUsage } from 'types/ai';
import type { CompactionBudgetSnapshot, CompactionModelSnapshot, StructuredContextSummary } from 'types/chat';
import { structuredSummarySchema, validateStructuredSummary } from './summary-schema.mjs';

/** 摘要生成失败码。 */
export type SummaryGenerationErrorCode = 'MODEL_NOT_FOUND' | 'MODEL_RESOLUTION_FAILED' | 'MODEL_CALL_FAILED' | 'SCHEMA_INVALID';

/**
 * 摘要生成输入。
 */
export interface SummaryGenerationInput {
  /** 当前 Runtime ID，同时作为 AI 请求 ID。 */
  runtimeId: string;
  /** 当前模型上下文窗口。 */
  contextWindow?: number;
  /** 当前模型默认最大输出 Token。 */
  maxOutputTokens?: number;
  /** 已冻结的压缩预算。 */
  budgetSnapshot: CompactionBudgetSnapshot;
  /** 插入 pending 前冻结的摘要源。 */
  sourceSnapshot: CompactionSourceSnapshot;
}

/**
 * 摘要生成依赖。
 */
export interface SummaryGeneratorDependencies {
  /** 解析当前会话选中的模型。 */
  resolveModel: () => Promise<ChatModelResolution | null>;
  /** 调用 AI SDK 同步结构化生成。 */
  generateText: (createOptions: AICreateOptions, request: AIRequestOptions) => Promise<[AIServiceError] | [undefined, AIInvokeResult]>;
}

/** 摘要生成结果。 */
export type SummaryGenerationResult =
  | {
      status: 'success';
      summary: StructuredContextSummary;
      modelSnapshot: CompactionModelSnapshot;
      usage?: AIUsage;
    }
  | { status: 'failed'; errorCode: SummaryGenerationErrorCode };

/**
 * 创建脱敏模型快照。
 * @param resolution - 当前模型解析结果
 * @param input - 摘要生成输入
 * @returns 不含 secret 的模型快照
 */
function createModelSnapshot(resolution: ChatModelResolution, input: SummaryGenerationInput): CompactionModelSnapshot {
  return {
    providerType: resolution.createOptions.providerType,
    providerId: resolution.createOptions.providerId,
    modelId: resolution.modelId,
    contextWindow: input.contextWindow,
    maxOutputTokens: input.maxOutputTokens
  };
}

/**
 * 收集 parent summary 中保留的历史证据 Part ID。
 * @param summary - 上一个成功 checkpoint 摘要
 * @returns 历史证据 Part ID
 */
function collectParentSources(summary: StructuredContextSummary | undefined): string[] {
  if (!summary) return [];

  return [
    ...summary.objectives,
    ...summary.facts,
    ...summary.artifacts,
    ...summary.completedActions,
    ...summary.pendingActions,
    ...summary.openQuestions,
    ...summary.failures
  ].flatMap((item): string[] => item.sourcePartIds);
}

/**
 * 创建结构化摘要提示词。
 * @param snapshot - 插入 pending 前冻结的摘要源
 * @returns 模型提示词
 */
export function createSummaryPrompt(snapshot: CompactionSourceSnapshot): string {
  const source = {
    previousSummary: snapshot.parentCheckpoint,
    sourceParts: snapshot.sourceParts,
    boundaryPartId: snapshot.boundaryPartId
  };

  return [
    '将给定历史上下文压缩为结构化 checkpoint。',
    '同一目标被细化时更新原目标；明确替换目标时标记 superseded 并连接 supersededById。',
    '每个 objective 必须保留明确 successCriteria。pendingActions.owner 表示执行者，openQuestions.owner 表示回答者。',
    'ArtifactState.id 是稳定身份，path 只是可变当前位置；不要按文件名猜测移动关系。',
    '所有 sourcePartIds 只能引用输入中的 Part ID。不要添加输入之外的事实。',
    JSON.stringify(source)
  ].join('\n\n');
}

/**
 * 使用当前会话模型生成结构化摘要。
 * @param input - 冻结源和预算
 * @param dependencies - 模型解析与生成依赖
 * @returns 成功摘要或稳定失败码
 */
export async function generateStructuredSummary(input: SummaryGenerationInput, dependencies: SummaryGeneratorDependencies): Promise<SummaryGenerationResult> {
  const [resolutionResult] = await Promise.allSettled([dependencies.resolveModel()]);
  if (resolutionResult.status === 'rejected') return { status: 'failed', errorCode: 'MODEL_RESOLUTION_FAILED' };
  if (!resolutionResult.value) return { status: 'failed', errorCode: 'MODEL_NOT_FOUND' };

  const resolution = resolutionResult.value;
  const modelSnapshot = createModelSnapshot(resolution, input);
  const request: AIRequestOptions = {
    requestId: input.runtimeId,
    modelId: resolution.modelId,
    prompt: createSummaryPrompt(input.sourceSnapshot),
    maxOutputTokens: input.budgetSnapshot.summaryMaxTokens,
    output: {
      schema: structuredSummarySchema,
      name: 'context_compaction',
      description: 'Tibis rolling context checkpoint'
    }
  };
  const [generationResult] = await Promise.allSettled([dependencies.generateText(resolution.createOptions, request)]);
  if (generationResult.status === 'rejected') return { status: 'failed', errorCode: 'MODEL_CALL_FAILED' };

  const [serviceError, invokeResult] = generationResult.value;
  if (serviceError || !invokeResult) return { status: 'failed', errorCode: 'MODEL_CALL_FAILED' };

  const allowedPartIds = new Set<string>([
    ...input.sourceSnapshot.sourceParts.map((sourcePart) => sourcePart.part.id),
    ...collectParentSources(input.sourceSnapshot.parentCheckpoint)
  ]);
  const validation = validateStructuredSummary(invokeResult.output, allowedPartIds);
  if (!validation.ok) return { status: 'failed', errorCode: 'SCHEMA_INVALID' };

  return {
    status: 'success',
    summary: validation.summary,
    modelSnapshot,
    ...(invokeResult.usage ? { usage: invokeResult.usage } : {})
  };
}
