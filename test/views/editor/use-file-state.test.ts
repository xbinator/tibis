/**
 * @file use-file-state.test.ts
 * @description 验证编辑器文件状态初始化时的草稿脏状态识别。
 */
import type { DebouncedFunc } from 'lodash-es';
import { ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileAutoSaveController } from '@/hooks/useFileAutoSave';
import type { StoredFile } from '@/shared/storage/files/types';
import { useFileState } from '@/views/editor/hooks/useFileState';
import type { EditorFile } from '@/views/editor/types';

const getFileByIdMock = vi.hoisted(() => vi.fn());
const addFileMock = vi.hoisted(() => vi.fn());
const updateFileMock = vi.hoisted(() => vi.fn());
const clearDirtyMock = vi.hoisted(() => vi.fn());
const setDirtyMock = vi.hoisted(() => vi.fn());
const isDirtyMock = vi.hoisted(() => vi.fn());

vi.mock('@/stores/workspace/files', () => ({
  useFilesStore: () => ({
    getFileById: getFileByIdMock,
    addFile: addFileMock,
    updateFile: updateFileMock
  })
}));

vi.mock('@/stores/workspace/tabs', () => ({
  useTabsStore: () => ({
    clearDirty: clearDirtyMock,
    setDirty: setDirtyMock,
    isDirty: isDirtyMock
  })
}));

/**
 * 创建自动保存控制器测试替身。
 * @returns 自动保存控制器
 */
function createAutoSaveController(): FileAutoSaveController {
  return {
    save: vi.fn(),
    debouncedSave: vi.fn() as unknown as DebouncedFunc<() => Promise<void>>,
    isPaused: ref(false),
    pause: vi.fn(),
    resume: vi.fn()
  };
}

/**
 * 创建最近文件存储记录。
 * @returns 最近文件记录
 */
function createStoredFile(): StoredFile {
  return {
    type: 'file',
    id: 'file-1',
    path: '/workspace/note.md',
    content: 'cached content',
    savedContent: 'previous disk content',
    name: 'note',
    ext: 'md'
  };
}

describe('useFileState', (): void => {
  beforeEach((): void => {
    getFileByIdMock.mockReset();
    addFileMock.mockReset();
    updateFileMock.mockReset();
    clearDirtyMock.mockReset();
    setDirtyMock.mockReset();
    isDirtyMock.mockReset();
    isDirtyMock.mockReturnValue(false);
  });

  it('does not treat a cached baseline mismatch as a draft when the tab is not dirty', async (): Promise<void> => {
    const fileId = ref('file-1');
    const fileState = ref<EditorFile>({ id: '', name: '', content: '', ext: 'md', path: null });
    const actions = useFileState({
      fileId,
      fileState,
      switchWatchedFile: vi.fn(),
      autoSave: createAutoSaveController(),
      finishReload: vi.fn()
    });

    actions.pauseDirtyTracking();
    await actions.initializeFileState(createStoredFile(), 'file-1');
    actions.resumeDirtyTracking();

    expect(actions.hasUnsavedDraft.value).toBe(false);
    expect(clearDirtyMock).toHaveBeenCalledWith('file-1');
    expect(setDirtyMock).not.toHaveBeenCalled();
  });
});
