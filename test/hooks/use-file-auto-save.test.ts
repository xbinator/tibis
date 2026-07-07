/**
 * @file use-file-auto-save.test.ts
 * @description 验证共享最近文件自动保存 hook。
 */
import { effectScope, nextTick, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFileAutoSave } from '@/hooks/useFileAutoSave';
import type { FileSessionState } from '@/hooks/useFileSession';

const getFileByIdMock = vi.hoisted(() => vi.fn());
const updateFileMock = vi.hoisted(() => vi.fn());
const addFileMock = vi.hoisted(() => vi.fn());

vi.mock('@/stores/workspace/files', () => ({
  useFilesStore: () => ({
    getFileById: getFileByIdMock,
    updateFile: updateFileMock,
    addFile: addFileMock
  })
}));

/**
 * 创建文件会话状态。
 * @param content - 文件内容
 * @returns 文件会话状态
 */
function createState(content: string): FileSessionState {
  return {
    id: 'file-1',
    name: 'Untitled',
    ext: 'json',
    path: null,
    content
  };
}

describe('useFileAutoSave', (): void => {
  beforeEach((): void => {
    getFileByIdMock.mockReset();
    updateFileMock.mockReset();
    addFileMock.mockReset();
    getFileByIdMock.mockResolvedValue({ id: 'file-1', type: 'file' });
  });

  it('updates an existing recent file with modifiedAt', async (): Promise<void> => {
    const scope = effectScope();
    const fileState = ref<FileSessionState>(createState('one'));

    await scope.run(async (): Promise<void> => {
      const autoSave = useFileAutoSave(fileState, { delay: 0 });

      fileState.value = { ...fileState.value, content: 'two' };
      await nextTick();
      await autoSave.save();
    });
    scope.stop();

    expect(updateFileMock).toHaveBeenCalledWith(
      'file-1',
      expect.objectContaining({
        content: 'two',
        modifiedAt: expect.any(Number)
      })
    );
  });

  it('does not save while paused', async (): Promise<void> => {
    const scope = effectScope();
    const fileState = ref<FileSessionState>(createState('one'));

    await scope.run(async (): Promise<void> => {
      const autoSave = useFileAutoSave(fileState, { delay: 0 });

      autoSave.pause();
      fileState.value = { ...fileState.value, content: 'two' };
      await nextTick();
      await autoSave.save();
    });
    scope.stop();

    expect(updateFileMock).not.toHaveBeenCalled();
    expect(addFileMock).not.toHaveBeenCalled();
  });
});
