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

export const storeEvents = {
  fileMissing: 'store:fileMissing',
  fileRecovered: 'store:fileRecovered',

  emitFileMissing(fileId: string): void {
    emitter.emit(this.fileMissing, { fileId } satisfies FileMissingPayload);
  },

  emitFileRecovered(fileId: string): void {
    emitter.emit(this.fileRecovered, { fileId } satisfies FileRecoveredPayload);
  },

  onFileMissing(handler: (payload: FileMissingPayload) => void): () => void {
    return emitter.on(this.fileMissing, handler as (payload: unknown) => void);
  },

  onFileRecovered(handler: (payload: FileRecoveredPayload) => void): () => void {
    return emitter.on(this.fileRecovered, handler as (payload: unknown) => void);
  }
};
