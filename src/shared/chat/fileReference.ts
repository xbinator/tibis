/**
 * @file fileReference.ts
 * @description 聊天输入框文件引用插入事件与路径行号工具。
 */
import { emitter } from '@/utils/emitter';

/** 聊天输入框文件引用插入事件名 */
export const CHAT_FILE_REFERENCE_INSERT_EVENT = 'chat:file-reference:insert';

/**
 * 聊天输入框文件引用插入事件负载。
 */
export interface ChatFileReferenceInsertPayload {
  /** 完整文件路径，未保存文件为 null */
  filePath: string | null;
  /** 展示用文件名 */
  fileName: string;
  /** 行号或行号范围 */
  line: number | string;
}

/**
 * 从文件路径中提取展示文件名。
 * @param filePath - 完整文件路径
 */
export function getFileNameFromPath(filePath: string): string {
  return filePath.split(/[\\/]/).filter(Boolean).pop() ?? filePath;
}

/**
 * 根据选区起止位置前的文本计算行号或行号范围。
 * @param textBeforeStart - 选区起点之前的文本
 * @param textBeforeEnd - 选区终点之前的文本
 */
export function getLineRangeFromTextBeforeSelection(textBeforeStart: string, textBeforeEnd: string): string {
  const startLine = textBeforeStart.split(/\r?\n/).length;
  const endLine = textBeforeEnd.split(/\r?\n/).length;

  return startLine === endLine ? String(startLine) : `${startLine}-${endLine}`;
}

/**
 * 判断未知值是否为文件引用插入事件负载。
 * @param payload - 待判断负载
 */
export function isChatFileReferenceInsertPayload(payload: unknown): payload is ChatFileReferenceInsertPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return false;
  }

  const candidate = payload as Partial<ChatFileReferenceInsertPayload>;

  return (
    ((typeof candidate.filePath === 'string' && candidate.filePath.length > 0) || candidate.filePath === null) &&
    typeof candidate.fileName === 'string' &&
    candidate.fileName.length > 0 &&
    (typeof candidate.line === 'number' || (typeof candidate.line === 'string' && candidate.line.length > 0))
  );
}

/**
 * 发出聊天输入框文件引用插入事件。
 * @param payload - 文件引用数据
 */
export function emitChatFileReferenceInsert(payload: ChatFileReferenceInsertPayload): void {
  emitter.emit(CHAT_FILE_REFERENCE_INSERT_EVENT, payload);
}

/**
 * 监听聊天输入框文件引用插入事件。
 * @param handler - 事件处理函数
 */
export function onChatFileReferenceInsert(handler: (payload: ChatFileReferenceInsertPayload) => void): () => void {
  return emitter.on(CHAT_FILE_REFERENCE_INSERT_EVENT, (payload: unknown): void => {
    if (!isChatFileReferenceInsertPayload(payload)) {
      return;
    }

    handler(payload);
  });
}
