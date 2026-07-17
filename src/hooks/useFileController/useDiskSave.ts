/**
 * @file useDiskSave.ts
 * @description 管理文件控制器的磁盘保存策略、串行快照写入与补写。
 */
import type { FileOperationSnapshot, FileWriteContext } from './types';
import type { Ref } from 'vue';
import { ref } from 'vue';
import { debounce } from 'lodash-es';
import type { FileState } from '@/shared/platform/native/types';
import type { EditorSaveStrategy } from '@/stores/editor/preferences';
import { asyncTo } from '@/utils/asyncTo';

/**
 * 磁盘保存调度配置。
 */
export interface DiskSaveOptions {
  /** 当前文件 ID。 */
  fileId: Ref<string>;
  /** 当前文件状态。 */
  fileState: Ref<FileState>;
  /** 当前磁盘保存策略。 */
  saveStrategy: Ref<EditorSaveStrategy>;
  /** 当前会话版本。 */
  sessionVersion: Ref<number>;
  /** 当前内容修订号。 */
  contentRevision: Ref<number>;
  /** 当前文件是否存在未保存内容。 */
  isDirty: () => boolean;
  /** 当前会话是否允许自动写盘。 */
  canAutoWrite: () => boolean;
  /** 执行精确快照写盘。 */
  onWriteFile: (context: FileWriteContext) => Promise<void>;
  /** 提交成功写入的内容快照。 */
  onCommitSnapshot: (snapshot: FileOperationSnapshot) => void;
  /** 写盘前登记快照。 */
  onBeforeWrite?: (snapshot: FileOperationSnapshot) => void;
  /** 写盘失败后清理快照。 */
  onWriteFailed?: (snapshot: FileOperationSnapshot, error: Error) => void;
  /** onChange 防抖延迟。 */
  delay?: number;
}

/**
 * 可独立持有的磁盘写入暂停原因。
 */
export type DiskSavePauseReason = string;

/**
 * 磁盘保存调度控制器。
 */
export interface DiskSaveController {
  /** 当前是否正在写盘。 */
  isSaving: Ref<boolean>;
  /** 最近一次写盘错误。 */
  saveError: Ref<Error | null>;
  /** 内容变化后的自动写盘调度。 */
  onScheduleSave: () => void;
  /** 编辑区域失焦处理。 */
  onBlur: () => Promise<void>;
  /** 不受自动策略限制的手动快照保存。 */
  onSaveSnapshot: () => Promise<boolean>;
  /** 立即触发并等待当前允许的写盘任务。 */
  onFlushSave: () => Promise<void>;
  /** 暂停新写入、取消待执行任务并等待当前写入结束。 */
  onPauseSave: (reason?: DiskSavePauseReason) => Promise<void>;
  /** 释放指定原因持有的写入暂停。 */
  onResumeSave: (reason?: DiskSavePauseReason) => void;
  /** 取消尚未执行的防抖写盘。 */
  onDisposeSave: () => void;
}

const DEFAULT_SAVE_DELAY = 800;

/**
 * 创建磁盘保存策略调度器。
 * @param options - 保存策略、状态与写盘事件
 * @returns 磁盘保存调度控制器
 */
export function useDiskSave(options: DiskSaveOptions): DiskSaveController {
  const {
    fileId,
    fileState,
    saveStrategy,
    sessionVersion,
    contentRevision,
    isDirty,
    canAutoWrite,
    onWriteFile,
    onCommitSnapshot,
    onBeforeWrite,
    onWriteFailed,
    delay = DEFAULT_SAVE_DELAY
  } = options;
  const isSaving = ref<boolean>(false);
  const saveError = ref<Error | null>(null);
  let activeTask: Promise<boolean> | null = null;
  let pendingSave = false;
  let pendingManualSave = false;
  const pauseReasons = new Set<DiskSavePauseReason>();

  /**
   * 捕获当前磁盘操作的不可变快照。
   * @returns 当前文件操作快照
   */
  function onCaptureSnapshot(): FileOperationSnapshot {
    return {
      fileId: fileId.value,
      sessionVersion: sessionVersion.value,
      contentRevision: contentRevision.value,
      path: fileState.value.path,
      content: fileState.value.content
    };
  }

  /**
   * 判断当前状态是否允许执行一次写盘。
   * @param manual - 是否为用户显式保存
   * @returns 是否允许写盘
   */
  function onCanWrite(manual: boolean): boolean {
    return pauseReasons.size === 0 && Boolean(fileState.value.path) && (manual || isDirty()) && (manual || canAutoWrite());
  }

  /**
   * 执行一次当前内容快照写盘。
   * @param manual - 是否为用户显式保存
   */
  async function onWriteSnapshot(manual: boolean): Promise<boolean> {
    if (!onCanWrite(manual)) {
      return false;
    }

    const snapshot = onCaptureSnapshot();
    if (!snapshot.path) {
      return false;
    }

    isSaving.value = true;
    onBeforeWrite?.(snapshot);
    const [error] = await asyncTo(onWriteFile({ path: snapshot.path, content: snapshot.content }));
    isSaving.value = false;

    if (error) {
      saveError.value = error;
      onWriteFailed?.(snapshot, error);
      return false;
    }

    saveError.value = null;
    onCommitSnapshot(snapshot);
    return true;
  }

  /**
   * 持续处理写盘期间合并产生的最新请求。
   */
  async function onDrainSaves(): Promise<boolean> {
    if (!pendingSave) {
      return true;
    }

    const manual = pendingManualSave;
    pendingSave = false;
    pendingManualSave = false;
    const didSave = await onWriteSnapshot(manual);
    // 写盘期间产生的新请求递归进入下一轮，保持队列串行且只提交最新快照。
    const didDrain = await onDrainSaves();
    return didSave && didDrain;
  }

  /**
   * 将一次写盘请求合并到当前串行任务。
   * @param manual - 是否为用户显式保存
   * @returns 当前串行写盘任务
   */
  function onRequestSave(manual: boolean): Promise<boolean> {
    if (!onCanWrite(manual)) {
      return Promise.resolve(false);
    }

    pendingSave = true;
    pendingManualSave = pendingManualSave || manual;

    if (!activeTask) {
      activeTask = onDrainSaves().finally((): void => {
        activeTask = null;
      });
    }

    return activeTask;
  }

  const debouncedSave = debounce((): Promise<boolean> => onRequestSave(false), delay);

  /**
   * 按 onChange 策略调度一次防抖写盘。
   */
  function onScheduleSave(): void {
    if (saveStrategy.value !== 'onChange' || !onCanWrite(false)) {
      return;
    }

    debouncedSave();
  }

  /**
   * 按 onBlur 策略执行一次写盘。
   */
  async function onBlur(): Promise<void> {
    if (saveStrategy.value !== 'onBlur') {
      return;
    }

    debouncedSave.cancel();
    await onRequestSave(false);
  }

  /**
   * 执行一次用户显式快照保存。
   */
  async function onSaveSnapshot(): Promise<boolean> {
    return onRequestSave(true);
  }

  /**
   * 立即触发挂起的自动写盘并等待当前队列。
   */
  async function onFlushSave(): Promise<void> {
    if (pauseReasons.size > 0) {
      if (activeTask) {
        await activeTask;
      }
      return;
    }

    const flushedTask = debouncedSave.flush();
    if (flushedTask) {
      await flushedTask;
    }
    if (activeTask) {
      await activeTask;
    }
  }

  /**
   * 暂停调度并等待已经进入平台层的写盘完成。
   */
  async function onPauseSave(reason: DiskSavePauseReason = 'default'): Promise<void> {
    pauseReasons.add(reason);
    debouncedSave.cancel();
    pendingSave = false;
    pendingManualSave = false;
    if (activeTask) {
      await activeTask;
    }
  }

  /**
   * 恢复接收自动与手动写盘请求。
   */
  function onResumeSave(reason: DiskSavePauseReason = 'default'): void {
    pauseReasons.delete(reason);
  }

  /**
   * 取消尚未触发的防抖写盘。
   */
  function onDisposeSave(): void {
    pauseReasons.add('default');
    pendingSave = false;
    pendingManualSave = false;
    debouncedSave.cancel();
  }

  return {
    isSaving,
    saveError,
    onScheduleSave,
    onBlur,
    onSaveSnapshot,
    onFlushSave,
    onPauseSave,
    onResumeSave,
    onDisposeSave
  };
}
