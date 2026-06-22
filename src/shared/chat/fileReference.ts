/**
 * @file fileReference.ts
 * @description 聊天输入框文件引用插入事件与路径行号工具。
 */
import { isNull, isString, isNumber, isObject, isArray } from 'lodash-es';
import { emitter } from '@/utils/emitter';

/** 聊天输入框文件引用插入事件名 */
export const CHAT_FILE_REFERENCE_INSERT_EVENT = 'chat:file-reference:insert';

/**
 * 聊天输入框文件引用插入事件负载。
 */
export interface ChatFileReferenceInsertPayload {
  /** 文件引用ID */
  id: string;
  /** 文件扩展名 */
  ext: string;
  /** 完整文件路径，未保存文件为 null */
  filePath: string | null;
  /** 展示用文件名 */
  fileName: string;
  /** 起始行号（1-based），0 表示无行号 */
  startLine: number;
  /** 结束行号（1-based），等于 startLine 时表示单行，0 仅与 startLine=0 配对 */
  endLine: number;
}

/** 待 BChat 挂载后消费的引用插入事件上限，避免侧边栏长期未打开时无限累积。 */
const MAX_PENDING_CHAT_FILE_REFERENCE_INSERTS = 20;

/** BChat 尚未注册监听时暂存的引用插入事件。 */
const pendingChatFileReferenceInserts: ChatFileReferenceInsertPayload[] = [];

/** 当前已注册的聊天文件引用监听数量。 */
let chatFileReferenceInsertListenerCount = 0;

function isValidLineRange(start: number, end: number): boolean {
  return isNumber(start) && isNumber(end) && start >= 0 && (start === end || (start > 0 && end >= start));
}

/**
 * 暂存聊天文件引用插入事件，等待聊天侧栏异步挂载后消费。
 * @param payload - 文件引用数据
 */
function enqueuePendingChatFileReferenceInsert(payload: ChatFileReferenceInsertPayload): void {
  pendingChatFileReferenceInserts.push(payload);

  if (pendingChatFileReferenceInserts.length > MAX_PENDING_CHAT_FILE_REFERENCE_INSERTS) {
    pendingChatFileReferenceInserts.shift();
  }
}

/**
 * 将暂存的文件引用插入事件交给新注册的监听器处理。
 * @param handler - 事件处理函数
 */
function flushPendingChatFileReferenceInserts(handler: (payload: ChatFileReferenceInsertPayload) => void): void {
  const pendingInserts = pendingChatFileReferenceInserts.splice(0);
  pendingInserts.forEach((payload) => handler(payload));
}

export function isChatFileReferenceInsertPayload(payload: unknown): payload is ChatFileReferenceInsertPayload {
  if (!isObject(payload) || isArray(payload)) return false;

  const { filePath, fileName, startLine, endLine } = payload as ChatFileReferenceInsertPayload;

  return ((isString(filePath) && filePath.length > 0) || isNull(filePath)) && isString(fileName) && fileName.length > 0 && isValidLineRange(startLine, endLine);
}
/**
 * 发出聊天输入框文件引用插入事件。
 * @param payload - 文件引用数据
 */
export function emitChatFileReferenceInsert(payload: ChatFileReferenceInsertPayload): void {
  if (chatFileReferenceInsertListenerCount === 0) {
    enqueuePendingChatFileReferenceInsert(payload);
    return;
  }

  emitter.emit(CHAT_FILE_REFERENCE_INSERT_EVENT, payload);
}

/**
 * 监听聊天输入框文件引用插入事件。
 * @param handler - 事件处理函数
 */
export function onChatFileReferenceInsert(handler: (payload: ChatFileReferenceInsertPayload) => void): () => void {
  chatFileReferenceInsertListenerCount += 1;

  const unregister = emitter.on(CHAT_FILE_REFERENCE_INSERT_EVENT, (payload: unknown): void => {
    if (!isChatFileReferenceInsertPayload(payload)) {
      return;
    }

    handler(payload);
  });

  flushPendingChatFileReferenceInserts(handler);

  return (): void => {
    unregister();
    chatFileReferenceInsertListenerCount = Math.max(0, chatFileReferenceInsertListenerCount - 1);
  };
}
