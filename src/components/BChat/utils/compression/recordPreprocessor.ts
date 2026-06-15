/**
 * @file recordPreprocessor.ts
 * @description 摘要生成：规则裁剪 + AI 结构化摘要生成。
 */
import type { RuleTrimResult, TrimmedMessageItem } from './types';
import { compact, sumBy } from 'lodash-es';
import type { Message } from '@/components/BChat/utils/types';
import { COMPRESSION_INPUT_CHAR_LIMIT, COMPRESSION_SUMMARY_TEXT_MAX } from './constant';

/**
 * 判断是否为可移除的空 assistant 占位消息。
 */
function isEmptyAssistantPlaceholder(message: Message): boolean {
  return message.role === 'assistant' && !message.content && !message.usage && !message.parts.length;
}

/**
 * 截断字符串中间部分，保留首尾关键信息。
 * @param text - 原始文本
 * @param maxLen - 最大长度
 * @returns 截断后的文本
 */
function truncateMiddle(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const headLen = Math.ceil(maxLen * 0.4);
  const tailLen = maxLen - headLen - 3;
  return `${text.slice(0, headLen)}...${text.slice(-tailLen)}`;
}

/**
 * 安全摘要 tool-result，避免直接 JSON.stringify 原始 result。
 * 防止循环引用、BigInt 报错、敏感字段泄漏和无意义截断。
 * @param part - tool-result 类型的 part
 * @returns 摘要信息对象
 */
function safeToolResultSummary(part: { toolName: string; result: unknown; isError?: boolean }): {
  toolName: string;
  status: string;
  message: string;
} | null {
  const { result } = part;
  let message = '';
  if (typeof result === 'string') {
    message = result.replace(/\s+/g, ' ').trim();
  } else if (result && typeof result === 'object' && !Array.isArray(result)) {
    const obj = result as Record<string, unknown>;
    message = String(obj.message ?? obj.error ?? obj.summary ?? obj.status ?? '');
  }
  return {
    toolName: part.toolName,
    status: part.isError ? 'error' : 'success',
    message: truncateMiddle(message, 120)
  };
}

/**
 * 从消息中提取裁剪后的文本内容。
 */
function extractTrimmedText(message: Message): string {
  // 处理 parts 内容生成摘要
  const partsText = compact(
    message.parts.map((part) => {
      if (part.type === 'text') return part.text;
      if (part.type === 'thinking') {
        // 不将 raw thinking 持久化进摘要，仅保留 provider 明确返回的 reasoningSummary（如果可用）
        return '[thinking: 已省略模型推理过程]';
      }
      if (part.type === 'tool' && part.status !== 'done') {
        return `[tool-call: ${part.toolName}]`;
      }
      if (part.type === 'tool' && part.result) {
        const summary = safeToolResultSummary({ toolName: part.toolName, result: part.result });
        return summary ? `[tool-result: ${summary.toolName}, ${summary.status}, ${summary.message}]` : `[tool-result: ${part.toolName}]`;
      }
      if (part.type === 'error') {
        return `[error: ${part.text}]`;
      }
      if (part.type === 'confirmation') {
        let status = '待确认';
        if (part.confirmationStatus === 'approved') {
          status = '已确认';
        } else if (part.confirmationStatus === 'cancelled') {
          status = '已取消';
        } else if (part.confirmationStatus === 'expired') {
          status = '已过期';
        }
        return `[confirmation: ${part.title} - ${status}]`;
      }
      return '';
    })
  ).join(' ');
  // 如果有 content 文本，合并
  if (message.content) {
    // 如果有文件引用，每个引用独立提取 intent，优先使用引用自身的 selectedContent 摘要
    if (message.references?.length) {
      return message.references
        .map((ref) => {
          const lineInfo = ref.startLine ? `:${ref.startLine}-${ref.endLine}` : '';
          const fileName = ref.path.split('/').pop() || ref.path;
          let snippet = '';
          if (ref.selectedContent) {
            if (ref.selectedContent.length > 80) {
              snippet = `${ref.selectedContent.slice(0, 40)}...${ref.selectedContent.slice(-30)}`;
            } else {
              snippet = ref.selectedContent;
            }
          }
          return `[file: ${fileName}${lineInfo}, intent: ${message.content.slice(0, 60)}, snippet: ${snippet}]`;
        })
        .join('; ');
    }

    // content + partsText 合并
    return partsText ? `${message.content} ${partsText}` : message.content;
  }

  return partsText;
}

/**
 * 规则裁剪：移除空占位、去重错误、裁剪长内容、控制总字符数。
 * @param messages - 待裁剪的消息列表
 * @param charLimit - 输出字符硬上限
 * @returns 裁剪结果
 */
export function ruleTrim(messages: Message[], charLimit: number = COMPRESSION_INPUT_CHAR_LIMIT): RuleTrimResult {
  let truncated = false;
  let totalChars = 0;

  // 第一步：过滤空占位消息
  const filtered = messages.filter((m) => !isEmptyAssistantPlaceholder(m));

  // 第二步：提取裁剪文本并去重连续重复错误
  const items: TrimmedMessageItem[] = [];
  for (let i = 0; i < filtered.length; i += 1) {
    const msg = filtered[i];
    const trimmedText = extractTrimmedText(msg);

    // 去重：连续重复且内容完全相同的消息只保留第一条
    if (items.length > 0) {
      const prev = items[items.length - 1];
      if (prev.trimmedText === trimmedText) {
        continue;
      }
    }

    items.push({
      messageId: msg.id,
      role: msg.role === 'user' ? 'user' : 'assistant',
      trimmedText
    });
  }

  // 第三步：计算总字符数并应用硬上限截断
  for (let i = 0; i < items.length; i += 1) {
    const itemCharCount = items[i].trimmedText.length;
    if (totalChars + itemCharCount > charLimit) {
      // 达到上限，截断当前项并丢弃后续
      const remaining = charLimit - totalChars;
      if (remaining > 0 && i < items.length) {
        items[i].trimmedText = items[i].trimmedText.slice(0, remaining);
        totalChars += remaining;
        // 标记该项被截断
        items[i].trimmedText += '...';
      }
      // 丢弃后续项
      items.splice(i + 1);
      truncated = true;
      break;
    }
    totalChars += itemCharCount;
  }

  totalChars = sumBy(items, (item) => item.trimmedText.length);

  return {
    items,
    charCount: totalChars,
    truncated
  };
}

/**
 * 截断压缩记录文本到硬上限。
 * @param text - 原始摘要文本
 * @param maxChars - 最大字符数
 * @returns 截断后的文本
 */
export function truncateSummaryText(text: string, maxChars: number = COMPRESSION_SUMMARY_TEXT_MAX): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}...`;
}
