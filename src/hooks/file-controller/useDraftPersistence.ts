/**
 * @file useDraftPersistence.ts
 * @description 管理文件控制器最近文件草稿的防抖持久化与立即补写。
 */
import type { FileRecordContext } from './types';
import type { Ref } from 'vue';
import { ref } from 'vue';
import { debounce } from 'lodash-es';
import type { FileSessionState } from '@/hooks/types';
import type { StoredDocumentRecord } from '@/shared/storage/files/types';
import { useRecentStore } from '@/stores/workspace/recent';
import { asyncTo } from '@/utils/asyncTo';

/**
 * 草稿持久化配置。
 */
export interface DraftPersistenceOptions<TData> {
  /** 当前文件状态。 */
  fileState: Ref<FileSessionState>;
  /** 当前页面业务数据。 */
  data: Ref<TData>;
  /** 最近一次磁盘同步内容。 */
  savedContent: Ref<string>;
  /** 构建文件类型对应的最近记录。 */
  onBuildRecord: (context: FileRecordContext<TData>) => StoredDocumentRecord;
  /** 草稿防抖延迟。 */
  delay?: number;
}

/**
 * 草稿持久化控制器。
 */
export interface DraftPersistenceController {
  /** 最近一次草稿持久化错误。 */
  draftError: Ref<Error | null>;
  /** 调度一次防抖草稿保存。 */
  onScheduleDraft: () => void;
  /** 立即写入并等待全部草稿任务。 */
  onFlushDraft: () => Promise<void>;
  /** 取消尚未执行的草稿任务。 */
  onDisposeDraft: () => void;
}

const DEFAULT_DRAFT_DELAY = 500;

/**
 * 创建最近文件草稿持久化控制器。
 * @param options - 当前文件状态与记录构建事件
 * @returns 草稿调度、补写与清理动作
 */
export function useDraftPersistence<TData>(options: DraftPersistenceOptions<TData>): DraftPersistenceController {
  const { fileState, data, savedContent, onBuildRecord, delay = DEFAULT_DRAFT_DELAY } = options;
  const recentStore = useRecentStore();
  const draftError = ref<Error | null>(null);
  let activeTask: Promise<void> = Promise.resolve();

  /**
   * 将执行时的最新状态写入最近文件存储。
   */
  async function onWriteDraft(): Promise<void> {
    const modifiedAt = Date.now();
    let record: StoredDocumentRecord;
    try {
      record = onBuildRecord({
        fileState: { ...fileState.value },
        data: data.value,
        savedContent: savedContent.value,
        modifiedAt
      });
    } catch (error: unknown) {
      draftError.value = error instanceof Error ? error : new Error('build draft record failed');
      return;
    }
    const [readError, stored] = await asyncTo(recentStore.getFileById(record.id));

    if (readError) {
      draftError.value = readError;
      return;
    }

    const writeTask = stored ? recentStore.updateFile(record.id, record) : recentStore.addFile(record);
    const [writeError] = await asyncTo(writeTask);
    draftError.value = writeError ?? null;
  }

  /**
   * 串行追加一次草稿写入，避免并发覆盖最近记录。
   * @returns 当前写入队列
   */
  function onQueueDraft(): Promise<void> {
    activeTask = activeTask.then(onWriteDraft);
    return activeTask;
  }

  const debouncedDraft = debounce(onQueueDraft, delay);

  /**
   * 调度一次防抖草稿保存。
   */
  function onScheduleDraft(): void {
    debouncedDraft();
  }

  /**
   * 立即触发挂起的草稿，并等待队列完成。
   */
  async function onFlushDraft(): Promise<void> {
    const flushedTask = debouncedDraft.flush();
    if (flushedTask) {
      await flushedTask;
    }
    await activeTask;
  }

  /**
   * 取消尚未触发的防抖草稿任务。
   */
  function onDisposeDraft(): void {
    debouncedDraft.cancel();
  }

  return {
    draftError,
    onScheduleDraft,
    onFlushDraft,
    onDisposeDraft
  };
}
