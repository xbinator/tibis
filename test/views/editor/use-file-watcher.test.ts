/**
 * @file use-file-watcher.test.ts
 * @description 验证编辑器文件监听器对内部写盘事件的抑制行为。
 * @vitest-environment jsdom
 */
import { defineComponent } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileChangeEvent } from '@/shared/platform/native/types';
import { useFileWatcher } from '@/views/editor/hooks/useFileWatcher';

const onFileChangedNativeMock = vi.hoisted(() => vi.fn());
const confirmMock = vi.hoisted(() => vi.fn());

vi.mock('@/shared/platform', () => ({
  native: {
    onFileChanged: onFileChangedNativeMock
  }
}));

vi.mock('@/utils/modal', () => ({
  Modal: {
    confirm: confirmMock
  }
}));

type FileWatcherController = ReturnType<typeof useFileWatcher>;

interface FileWatcherExpose {
  watcher: FileWatcherController;
}

const FILE_PATH = '/workspace/note.md';

/**
 * 挂载文件监听器宿主组件，并暴露 hook 控制器。
 * @returns 文件监听器控制器
 */
function mountFileWatcher(): FileWatcherController {
  const wrapper = mount(
    defineComponent({
      name: 'FileWatcherHost',
      setup(_, { expose }): () => null {
        const watcher = useFileWatcher();
        expose({ watcher });
        return (): null => null;
      }
    })
  );

  return (wrapper.vm as unknown as FileWatcherExpose).watcher;
}

/**
 * 获取最近一次注册的 native 文件变化回调。
 * @returns native 文件变化回调
 */
function getNativeFileChangedHandler(): (event: FileChangeEvent) => void | Promise<void> {
  const lastCall = onFileChangedNativeMock.mock.calls.at(-1);

  if (!lastCall) {
    throw new Error('native file changed handler was not registered');
  }

  return lastCall[0] as (event: FileChangeEvent) => void | Promise<void>;
}

/**
 * 触发一次 native 文件变化事件并等待异步确认流程完成。
 * @param event - 文件变化事件
 */
async function emitNativeFileChanged(event: FileChangeEvent): Promise<void> {
  await getNativeFileChangedHandler()(event);
  await flushPromises();
}

describe('useFileWatcher', (): void => {
  beforeEach((): void => {
    onFileChangedNativeMock.mockReset();
    onFileChangedNativeMock.mockReturnValue(vi.fn());
    confirmMock.mockReset();
    confirmMock.mockResolvedValue([true, false]);
  });

  it('ignores repeated self-write change events with the same content while the tab is dirty', async (): Promise<void> => {
    const watcher = mountFileWatcher();
    const onExternalFileChanged = vi.fn();

    watcher.setIsDirty((): boolean => true);
    watcher.setOnFileChanged(onExternalFileChanged);
    await watcher.switchWatchedFile(FILE_PATH);
    watcher.suppressNextChange(FILE_PATH);

    await emitNativeFileChanged({ type: 'change', filePath: FILE_PATH, content: 'saved content' });
    await emitNativeFileChanged({ type: 'change', filePath: FILE_PATH, content: 'saved content' });

    expect(confirmMock).not.toHaveBeenCalled();
    expect(onExternalFileChanged).not.toHaveBeenCalled();
  });

  it('still asks before reloading dirty content when a suppressed path receives unexpected content', async (): Promise<void> => {
    const watcher = mountFileWatcher();
    const onExternalFileChanged = vi.fn();

    watcher.setIsDirty((): boolean => true);
    watcher.setOnFileChanged(onExternalFileChanged);
    await watcher.switchWatchedFile(FILE_PATH);
    watcher.suppressNextChange(FILE_PATH, 'saved content');

    await emitNativeFileChanged({ type: 'change', filePath: FILE_PATH, content: 'external content' });

    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(onExternalFileChanged).not.toHaveBeenCalled();
  });

  it('does not keep suppressing the previous expected content after an unexpected external change', async (): Promise<void> => {
    const watcher = mountFileWatcher();
    const onExternalFileChanged = vi.fn();

    watcher.setIsDirty((): boolean => true);
    watcher.setOnFileChanged(onExternalFileChanged);
    await watcher.switchWatchedFile(FILE_PATH);
    watcher.suppressNextChange(FILE_PATH, 'saved content');

    await emitNativeFileChanged({ type: 'change', filePath: FILE_PATH, content: 'external content' });
    await emitNativeFileChanged({ type: 'change', filePath: FILE_PATH, content: 'saved content' });

    expect(confirmMock).toHaveBeenCalledTimes(2);
    expect(onExternalFileChanged).not.toHaveBeenCalled();
  });
});
