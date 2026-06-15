/**
 * @file useFileAutoSave.ts
 * @description 处理通用文件会话的最近文件自动保存。
 */
import type { FileSessionState } from './useFileSession';
import type { DebouncedFunc } from 'lodash-es';
import type { Ref } from 'vue';
import { getCurrentScope, onScopeDispose, ref, watch } from 'vue';
import { debounce } from 'lodash-es';
import type { StoredFile } from '@/shared/storage/files/types';
import { useFilesStore } from '@/stores/workspace/files';

/**
 * 自动保存配置。
 */
export interface FileAutoSaveOptions {
  /** debounce 延迟 */
  delay?: number;
}

/**
 * 最近文件自动保存控制器。
 */
export interface FileAutoSaveController {
  /** 立即保存当前文件状态 */
  save: () => Promise<void>;
  /** debounce 后保存当前文件状态 */
  debouncedSave: DebouncedFunc<() => Promise<void>>;
  /** 当前是否暂停自动保存 */
  isPaused: Ref<boolean>;
  /** 暂停自动保存 */
  pause: () => void;
  /** 恢复自动保存 */
  resume: () => void;
}

/**
 * 创建可写入最近文件存储的记录。
 * @param fileState - 当前文件会话状态
 * @param timestamp - 时间戳
 * @returns 最近文件记录
 */
function createStoredFile(fileState: FileSessionState, timestamp: number): StoredFile {
  return {
    ...fileState,
    type: 'file',
    createdAt: timestamp,
    modifiedAt: timestamp
  };
}

/**
 * 创建最近文件自动保存 hook。
 * @param fileState - 当前文件状态
 * @param options - 自动保存配置
 * @returns 自动保存控制器
 */
export function useFileAutoSave(fileState: Ref<FileSessionState>, options: FileAutoSaveOptions = {}): FileAutoSaveController {
  const { delay = 500 } = options;
  const filesStore = useFilesStore();
  const isPaused = ref<boolean>(false);

  /**
   * 将当前文件状态保存到最近文件存储。
   */
  async function saveToStorage(): Promise<void> {
    if (isPaused.value) {
      return;
    }

    const current = fileState.value;
    const modifiedAt = Date.now();
    const stored = await filesStore.getFileById(current.id);

    if (stored) {
      await filesStore.updateFile(current.id, { ...current, modifiedAt });
      return;
    }

    await filesStore.addFile(createStoredFile(current, modifiedAt));
  }

  const debouncedSave = debounce(saveToStorage, delay);
  const stopWatch = watch(
    () => fileState.value.content,
    (): void => {
      if (!isPaused.value) {
        debouncedSave();
      }
    }
  );

  /**
   * 暂停自动保存。
   */
  function pause(): void {
    isPaused.value = true;
  }

  /**
   * 恢复自动保存。
   */
  function resume(): void {
    isPaused.value = false;
  }

  /**
   * 释放自动保存内部资源，并在未暂停时补写一次最近文件。
   */
  function dispose(): void {
    stopWatch();
    debouncedSave.cancel();

    if (!isPaused.value) {
      saveToStorage().catch((error: unknown): void => {
        console.error('Failed to save file session on dispose:', error);
      });
    }
  }

  if (getCurrentScope()) {
    onScopeDispose(dispose);
  }

  return {
    save: saveToStorage,
    debouncedSave,
    isPaused,
    pause,
    resume
  };
}
