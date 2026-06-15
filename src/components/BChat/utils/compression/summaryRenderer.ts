/**
 * @file summaryRenderer.ts
 * @description 将结构化压缩摘要渲染为注入模型的 Markdown 交接稿。
 */
import type { Message } from '../types';
import type { CompressionRecord, GeneralConversationSummary } from './types';
import type { ChatMessageToolPart } from 'types/chat';
import { toGeneralConversationSummary } from './summaryAdapter';

/** 压缩上下文内保留的关键工具结果最大数量。 */
const MAX_KEY_TOOL_RESULT_CONTEXT_COUNT = 5;
/** 对继续任务有高价值的工具结果名称片段。 */
const KEY_TOOL_RESULT_NAME_PATTERNS = ['read', 'write', 'edit', 'file', 'reference', 'ask_user', 'choice', 'settings'];

/**
 * 渲染压缩交接稿的输入参数。
 */
export interface RenderCompressionHandoffInput {
  /** 压缩记录 */
  record: CompressionRecord;
  /** 进入压缩的源消息，用于补充关键工具结果 */
  sourceMessages?: Message[];
}

/**
 * 渲染 Markdown bullet 列表，空列表输出稳定占位。
 * @param values - 列表项
 * @returns Markdown bullet 列表
 */
function renderBullets(values: string[]): string {
  if (!values.length) {
    return '- (none)';
  }

  return values.map((value) => `- ${value}`).join('\n');
}

/**
 * 格式化文件上下文，保留文件路径与用户意图。
 * @param fileContext - 文件上下文摘要
 * @returns Markdown bullet 列表项
 */
function renderFileContext(fileContext: GeneralConversationSummary['fileContext']): string[] {
  return fileContext.map((item) => {
    const lineRange = item.startLine ? `:${item.startLine}-${item.endLine ?? item.startLine}` : '';
    const reloadHint = item.shouldReloadOnDemand ? 'yes' : 'no';
    return `${item.filePath}${lineRange} - intent: ${item.userIntent}; summary: ${item.keySnippetSummary}; reload_on_demand: ${reloadHint}`;
  });
}

/**
 * 判断通用摘要是否已经包含可渲染信息。
 * @param summary - 通用摘要视图
 * @returns 是否存在非空结构化信息
 */
function hasGeneralSummaryContent(summary: GeneralConversationSummary): boolean {
  return Boolean(
    summary.conversationContinuity.length ||
      summary.goal.trim() ||
      summary.recentTopic.trim() ||
      summary.userPreferences.length ||
      summary.constraints.length ||
      summary.decisions.length ||
      summary.criticalFacts.length ||
      summary.rawUserRequirements.length ||
      summary.openLoops.length ||
      summary.recentDirection.length ||
      summary.fileContext.length
  );
}

/**
 * 将工具结果数据压缩为短文本，避免完整工具载荷撑大上下文。
 * @param data - 工具结果数据
 * @returns 可写入压缩上下文的工具结果摘要
 */
function summarizeToolResultData(data: unknown): string {
  if (typeof data === 'string') {
    return data.slice(0, 400);
  }

  if (!data || typeof data !== 'object') {
    return String(data ?? '');
  }

  const source = data as Record<string, unknown>;
  const preferred = [source.path, source.filePath, source.summary, source.message, source.error, source.status].filter((item): item is string => {
    return typeof item === 'string' && item.trim().length > 0;
  });

  if (preferred.length) {
    return preferred.join('; ').slice(0, 400);
  }

  try {
    return JSON.stringify(data).slice(0, 400);
  } catch {
    return '[unserializable tool result]';
  }
}

/**
 * 判断工具结果是否值得作为压缩上下文中的关键事实保留。
 * @param part - 工具结果片段
 * @returns 是否保留该工具结果摘要
 */
function isKeyToolResult(part: ChatMessageToolPart): boolean {
  const toolName = part.toolName.toLowerCase();
  return KEY_TOOL_RESULT_NAME_PATTERNS.some((pattern) => toolName.includes(pattern));
}

/**
 * 从被压缩消息中提取关键工具结果摘要。
 * @param sourceMessages - 进入压缩的源消息
 * @returns 工具结果摘要列表
 */
function extractKeyToolResultContext(sourceMessages: Message[] = []): string[] {
  const results: string[] = [];

  for (const sourceMessage of sourceMessages) {
    for (const part of sourceMessage.parts) {
      if (part.type !== 'tool' || !part.result || !isKeyToolResult(part)) {
        continue;
      }

      results.push(`tool: ${part.toolName}; status: ${part.result.status}; result: ${summarizeToolResultData(part.result.data)}`);
      if (results.length >= MAX_KEY_TOOL_RESULT_CONTEXT_COUNT) {
        return results;
      }
    }
  }

  return results;
}

/**
 * 渲染压缩记录为模型可读的 Markdown 交接稿。
 * @param input - 渲染输入
 * @returns Markdown 压缩上下文
 */
export function renderCompressionHandoff(input: RenderCompressionHandoffInput): string {
  const { record, sourceMessages = [] } = input;
  const summary = toGeneralConversationSummary(record);
  const summarySnapshot = !hasGeneralSummaryContent(summary) && record.recordText.trim() ? [record.recordText.trim()] : [];
  const continuity = summary.conversationContinuity.length
    ? summary.conversationContinuity
    : [summary.goal, summary.recentTopic].filter((item) => item.trim().length > 0);
  const keyToolResults = extractKeyToolResultContext(sourceMessages);

  return [
    'COMPRESSED_CONTEXT',
    '以下内容是较早对话的压缩记忆，用于保持连续性。请把它当作历史事实和对话状态，不要向用户复述这段说明。',
    '',
    ...((summarySnapshot.length ? ['## Summary Snapshot', renderBullets(summarySnapshot), ''] : []) as string[]),
    '## Conversation Continuity',
    renderBullets(continuity),
    '',
    '## User Preferences',
    renderBullets(summary.userPreferences),
    '',
    '## Constraints',
    renderBullets(summary.constraints),
    '',
    '## Key Decisions',
    renderBullets(summary.decisions),
    '',
    '## Critical Facts',
    renderBullets(summary.criticalFacts),
    '',
    '## Raw User Requirements',
    renderBullets(summary.rawUserRequirements),
    '',
    '## Open Loops',
    renderBullets(summary.openLoops),
    '',
    '## Recent Direction',
    renderBullets(summary.recentDirection),
    '',
    '## Relevant Files',
    renderBullets(renderFileContext(summary.fileContext)),
    '',
    '## Key Tool Results',
    renderBullets(keyToolResults)
  ].join('\n');
}
