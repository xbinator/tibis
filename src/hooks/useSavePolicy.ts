/**
 * @file useSavePolicy.ts
 * @description 根据文件会话偏好执行真实磁盘保存策略。
 */
import type { Ref } from 'vue';
import { getCurrentScope, onScopeDispose, ref } from 'vue';
import type { EditorSaveStrategy } from '@/stores/editor/preferences';

/**
 * 真实磁盘写盘结果。
 */
export interface SaveToDiskResult {
  /** 本次写盘状态 */
  status: 'saved' | 'skipped' | 'failed';
  /** 写盘失败时的错误对象 */
  error?: Error;
}

/**
 * 保存策略执行所需依赖。
 */
export interface SavePolicyOptions {
  /** 当前保存策略 */
  saveStrategy: Ref<EditorSaveStrategy>;
  /** 当前文件是否已有磁盘路径 */
  hasFilePath: Ref<boolean>;
  /** 当前文档是否处于 dirty 状态 */
  isDirty: () => boolean;
  /** 执行一次真实磁盘写盘 */
  saveCurrentFileToDisk: () => Promise<SaveToDiskResult>;
}

/**
 * 保存策略控制器。
 */
export interface SavePolicyController {
  /** 释放保存策略内部资源 */
  dispose: () => void;
  /** 编辑器失焦处理 */
  handleEditorBlur: () => Promise<void>;
  /** 当前是否正在写盘 */
  isSaving: Ref<boolean>;
  /** 最近一次自动保存错误 */
  lastAutoSaveError: Ref<Error | null>;
  /** 内容变更通知 */
  notifyContentChanged: () => void;
  /** 保存期间是否存在待补发写盘 */
  pendingResave: Ref<boolean>;
}

const ON_CHANGE_DELAY = 800;

/**
 * 创建真实写盘保存策略执行器。
 * @param options - 保存策略依赖项
 * @returns 保存策略控制器
 */
export function useSavePolicy(options: SavePolicyOptions): SavePolicyController {
  const isSaving = ref(false);
  const pendingResave = ref(false);
  const lastAutoSaveError = ref<Error | null>(null);
  let timer: ReturnType<typeof setTimeout> | null = null;

  /**
   * 清理挂起的 debounce 定时器。
   */
  function clearScheduledSave(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  /**
   * 执行一次真实磁盘保存，并在保存中收到新请求时补发一轮。
   */
  async function runSave(): Promise<void> {
    if (!options.hasFilePath.value || !options.isDirty()) {
      return;
    }

    if (isSaving.value) {
      pendingResave.value = true;
      return;
    }

    isSaving.value = true;
    const result = await options.saveCurrentFileToDisk();
    isSaving.value = false;

    if (result.status === 'failed') {
      lastAutoSaveError.value = result.error ?? new Error('auto save failed');
    } else {
      lastAutoSaveError.value = null;
    }

    if (pendingResave.value) {
      pendingResave.value = false;
      await runSave();
    }
  }

  /**
   * 在内容变化时按 onChange 策略调度一次真实写盘。
   */
  function notifyContentChanged(): void {
    if (options.saveStrategy.value !== 'onChange' || !options.hasFilePath.value) {
      return;
    }

    clearScheduledSave();
    timer = setTimeout(() => {
      runSave();
    }, ON_CHANGE_DELAY);
  }

  /**
   * 在编辑器失焦时按 onBlur 策略执行一次真实写盘。
   */
  async function handleEditorBlur(): Promise<void> {
    if (options.saveStrategy.value !== 'onBlur') {
      return;
    }

    clearScheduledSave();
    await runSave();
  }

  /**
   * 释放保存策略内部资源。
   */
  function dispose(): void {
    clearScheduledSave();
  }

  if (getCurrentScope()) {
    onScopeDispose(dispose);
  }

  return {
    dispose,
    handleEditorBlur,
    isSaving,
    lastAutoSaveError,
    notifyContentChanged,
    pendingResave
  };
}
