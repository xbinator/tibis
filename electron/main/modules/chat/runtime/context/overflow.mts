/**
 * @file context-overflow.mts
 * @description ChatRuntime 上下文超限识别与重放降级辅助函数。
 */
import type { AIServiceError } from 'types/ai';
import type { ChatMessageFile, ChatMessageRecord } from 'types/chat';

/** Provider 上下文超限错误文案模式。 */
const CONTEXT_OVERFLOW_MESSAGE_PATTERNS = [
  /\b413\b/i,
  /context[_\s-]*length[_\s-]*exceeded/i,
  /maximum context length/i,
  /context window/i,
  /prompt is too long/i,
  /input is too long/i,
  /too many tokens/i,
  /exceed(?:ed|s)?.{0,32}(?:context|token)/i,
  /context.{0,32}(?:overflow|exceed|too long)/i
];

/**
 * 判断错误是否为 provider 上下文超限。
 * @param error - runtime 错误
 * @returns 是否可触发 overflow replay
 */
export function isContextOverflowError(error: AIServiceError): boolean {
  return CONTEXT_OVERFLOW_MESSAGE_PATTERNS.some((pattern) => pattern.test(error.message));
}

/**
 * 创建附件降级占位文本。
 * @param file - 消息附件
 * @returns 占位文本
 */
function createAttachmentPlaceholder(file: ChatMessageFile): string {
  return `[Attached ${file.mimeType ?? file.type}: ${file.name}]`;
}

/**
 * 移除会被模型当作媒体输入发送的远程地址。
 * @param file - 消息附件
 * @returns 降级后的附件
 */
function removeModelMediaUrl(file: ChatMessageFile): ChatMessageFile {
  const downgradedFile = { ...file };
  delete downgradedFile.url;
  return downgradedFile;
}

/**
 * 为 overflow replay 降级当前用户消息中的媒体附件。
 * @param message - 当前用户消息
 * @returns 降级后的用户消息
 */
export function downgradeUserMessageForOverflowReplay(message: ChatMessageRecord): ChatMessageRecord {
  if (!message.files?.length) return message;

  const content = [message.content.trim(), ...message.files.map(createAttachmentPlaceholder)].filter((item) => item.length > 0).join('\n');
  return {
    ...message,
    content,
    parts: content ? [{ type: 'text', text: content }] : [],
    files: message.files.map(removeModelMediaUrl)
  };
}

/**
 * 降级 replay 源消息中的当前用户消息。
 * @param sourceMessages - 原始源消息
 * @param userMessage - 当前用户消息
 * @returns 降级后的源消息
 */
export function downgradeOverflowReplaySourceMessages(sourceMessages: ChatMessageRecord[], userMessage: ChatMessageRecord): ChatMessageRecord[] {
  return sourceMessages.map((message) => (message.id === userMessage.id ? downgradeUserMessageForOverflowReplay(message) : message));
}
