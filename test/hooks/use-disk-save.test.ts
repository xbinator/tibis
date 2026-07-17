/**
 * @file use-disk-save.test.ts
 * @description 验证文件控制器的磁盘保存策略、快照提交与串行补写。
 */
import type { Ref } from 'vue';
import { ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDiskSave } from '@/hooks/file-controller/useDiskSave';
import type { FileSessionState } from '@/hooks/types';
import type { FileOperationSnapshot, FileWriteContext } from '@/hooks/useFileController';
import type { EditorSaveStrategy } from '@/stores/editor/preferences';

/**
 * 可由测试控制完成时机的 Promise。
 */
interface Deferred<T> {
  /** 待完成 Promise。 */
  promise: Promise<T>;
  /** 完成 Promise。 */
  resolve: (value: T | PromiseLike<T>) => void;
}

/**
 * 磁盘保存调度测试环境。
 */
interface DiskSaveHarness {
  /** 磁盘保存调度器。 */
  controller: ReturnType<typeof useDiskSave>;
  /** 可变文件状态。 */
  fileState: Ref<FileSessionState>;
  /** 可变内容修订号。 */
  contentRevision: Ref<number>;
  /** 磁盘写入事件。 */
  onWriteFile: ReturnType<typeof vi.fn<(context: FileWriteContext) => Promise<void>>>;
  /** 快照提交事件。 */
  onCommitSnapshot: ReturnType<typeof vi.fn<(snapshot: FileOperationSnapshot) => void>>;
}

/**
 * 创建可控 Promise。
 * @returns 可控 Promise
 */
function createDeferred<T>(): Deferred<T> {
  let onResolve: (value: T | PromiseLike<T>) => void = (): void => undefined;
  const promise = new Promise<T>((resolve) => {
    onResolve = resolve;
  });
  return { promise, resolve: onResolve };
}

/**
 * 创建磁盘保存调度测试环境。
 * @param strategy - 当前保存策略
 * @returns 调度器与可变测试状态
 */
function createHarness(strategy: EditorSaveStrategy): DiskSaveHarness {
  const fileId = ref<string>('file-1');
  const fileState = ref<FileSessionState>({
    id: 'file-1',
    name: 'Document',
    ext: 'md',
    path: '/tmp/document.md',
    content: 'changed'
  });
  const saveStrategy = ref<EditorSaveStrategy>(strategy);
  const sessionVersion = ref<number>(1);
  const contentRevision = ref<number>(1);
  const onWriteFile = vi.fn<(context: FileWriteContext) => Promise<void>>().mockResolvedValue(undefined);
  const onCommitSnapshot = vi.fn<(snapshot: FileOperationSnapshot) => void>();
  const controller = useDiskSave({
    fileId,
    fileState,
    saveStrategy,
    sessionVersion,
    contentRevision,
    isDirty: (): boolean => true,
    canAutoWrite: (): boolean => true,
    onWriteFile,
    onCommitSnapshot,
    delay: 800
  });

  return {
    controller,
    fileState,
    contentRevision,
    onWriteFile,
    onCommitSnapshot
  };
}

describe('useDiskSave', (): void => {
  beforeEach((): void => {
    vi.useFakeTimers();
  });

  afterEach((): void => {
    vi.useRealTimers();
  });

  it('does not automatically write on content change when strategy is off', async (): Promise<void> => {
    const harness = createHarness('off');

    harness.controller.onScheduleSave();
    await vi.runAllTimersAsync();

    expect(harness.onWriteFile).not.toHaveBeenCalled();
  });

  it('writes the current snapshot on blur only for onBlur', async (): Promise<void> => {
    const harness = createHarness('onBlur');

    await harness.controller.onBlur();

    expect(harness.onWriteFile).toHaveBeenCalledWith({ path: '/tmp/document.md', content: 'changed' });
    expect(harness.onCommitSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: 'file-1', contentRevision: 1, path: '/tmp/document.md', content: 'changed' })
    );
  });

  it('debounces onChange writes', async (): Promise<void> => {
    const harness = createHarness('onChange');

    harness.controller.onScheduleSave();
    await vi.advanceTimersByTimeAsync(799);
    expect(harness.onWriteFile).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(harness.onWriteFile).toHaveBeenCalledTimes(1);
  });

  it('coalesces edits during a write into one latest follow-up snapshot', async (): Promise<void> => {
    const harness = createHarness('onChange');
    const firstWrite = createDeferred<void>();
    harness.onWriteFile.mockReturnValueOnce(firstWrite.promise).mockResolvedValueOnce(undefined);

    const firstTask = harness.controller.onSaveSnapshot();
    await Promise.resolve();
    harness.fileState.value.content = 'latest';
    harness.contentRevision.value = 2;
    const secondTask = harness.controller.onSaveSnapshot();
    firstWrite.resolve(undefined);
    await Promise.all([firstTask, secondTask]);
    await harness.controller.onFlushSave();

    expect(harness.onWriteFile).toHaveBeenCalledTimes(2);
    expect(harness.onWriteFile).toHaveBeenLastCalledWith({ path: '/tmp/document.md', content: 'latest' });
  });

  it('cancels a debounced automatic write while the scheduler is paused', async (): Promise<void> => {
    const harness = createHarness('onChange');

    harness.controller.onScheduleSave();
    await harness.controller.onPauseSave();
    await vi.runAllTimersAsync();

    expect(harness.onWriteFile).not.toHaveBeenCalled();

    harness.controller.onResumeSave();
    harness.controller.onScheduleSave();
    await vi.runAllTimersAsync();
    expect(harness.onWriteFile).toHaveBeenCalledTimes(1);
  });

  it('waits for the active write and drops its pending follow-up when paused', async (): Promise<void> => {
    const harness = createHarness('onChange');
    const firstWrite = createDeferred<void>();
    harness.onWriteFile.mockReturnValueOnce(firstWrite.promise).mockResolvedValueOnce(undefined);

    const firstTask = harness.controller.onSaveSnapshot();
    await Promise.resolve();
    harness.fileState.value.content = 'latest';
    harness.contentRevision.value = 2;
    const secondTask = harness.controller.onSaveSnapshot();
    const pauseTask = harness.controller.onPauseSave();

    firstWrite.resolve(undefined);
    await Promise.all([firstTask, secondTask, pauseTask]);

    expect(harness.onWriteFile).toHaveBeenCalledTimes(1);
  });

  it('keeps writing paused until every overlapping reason is resumed', async (): Promise<void> => {
    const harness = createHarness('onChange');

    await harness.controller.onPauseSave('load');
    await harness.controller.onPauseSave('saveAs');
    harness.controller.onResumeSave('saveAs');
    harness.controller.onScheduleSave();
    await vi.runAllTimersAsync();
    expect(harness.onWriteFile).not.toHaveBeenCalled();

    harness.controller.onResumeSave('load');
    harness.controller.onScheduleSave();
    await vi.runAllTimersAsync();
    expect(harness.onWriteFile).toHaveBeenCalledTimes(1);
  });

  it('returns false when a manual snapshot write fails', async (): Promise<void> => {
    const harness = createHarness('off');
    harness.onWriteFile.mockRejectedValueOnce(new Error('disk unavailable'));

    await expect(harness.controller.onSaveSnapshot()).resolves.toBe(false);
    expect(harness.controller.saveError.value?.message).toBe('disk unavailable');
  });
});
