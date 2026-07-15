/**
 * @file events.ts
 * @description stores 层事件总线，用于解耦 store 间直接依赖。
 */
import { emitter } from '@/utils/emitter';

export interface FileMissingPayload {
  fileId: string;
}

export interface FileRecoveredPayload {
  fileId: string;
}

/**
 * 应用内成功保存的文件内容。
 */
export interface FileSavedPayload {
  /** 最终写入的文件绝对路径。 */
  filePath: string;
  /** 本次成功写入的完整内容。 */
  content: string;
}

export const storeEvents = {
  fileMissing: 'store:fileMissing',
  fileRecovered: 'store:fileRecovered',
  fileSaved: 'store:fileSaved',

  emitFileMissing(fileId: string): void {
    emitter.emit(this.fileMissing, { fileId } satisfies FileMissingPayload);
  },

  emitFileRecovered(fileId: string): void {
    emitter.emit(this.fileRecovered, { fileId } satisfies FileRecoveredPayload);
  },

  /**
   * 发布应用内文件保存事件。
   * @param filePath - 最终写入的文件绝对路径
   * @param content - 本次成功写入的完整内容
   */
  emitFileSaved(filePath: string, content: string): void {
    emitter.emit(this.fileSaved, { filePath, content } satisfies FileSavedPayload);
  },

  onFileMissing(handler: (payload: FileMissingPayload) => void): () => void {
    return emitter.on(this.fileMissing, handler as (payload: unknown) => void);
  },

  onFileRecovered(handler: (payload: FileRecoveredPayload) => void): () => void {
    return emitter.on(this.fileRecovered, handler as (payload: unknown) => void);
  },

  /**
   * 订阅应用内文件保存事件。
   * @param handler - 文件保存事件处理器
   * @returns 取消订阅函数
   */
  onFileSaved(handler: (payload: FileSavedPayload) => void): () => void {
    return emitter.on(this.fileSaved, handler as (payload: unknown) => void);
  }
};
