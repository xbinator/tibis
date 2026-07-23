/**
 * @file use-draft-persistence.test.ts
 * @description 验证文件控制器草稿持久化与磁盘保存策略相互独立。
 */
import type { Ref } from 'vue';
import { ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileRecordContext } from '@/hooks/useFileController/types';
import { useDraftPersistence } from '@/hooks/useFileController/useDraftPersistence';
import type { FileState } from '@/shared/platform/native/types';
import type { StoredDocumentRecord } from '@/shared/storage/files/types';

const getFileByIdMock = vi.hoisted(() => vi.fn());
const updateFileMock = vi.hoisted(() => vi.fn());
const addFileMock = vi.hoisted(() => vi.fn());

vi.mock('@/stores/workspace/recent', () => ({
  useRecentStore: () => ({
    getFileById: getFileByIdMock,
    updateFile: updateFileMock,
    addFile: addFileMock
  })
}));

/**
 * 创建草稿持久化测试状态。
 * @returns 文件状态与业务数据
 */
function createState(): { fileState: Ref<FileState>; data: Ref<string>; savedContent: Ref<string> } {
  return {
    fileState: ref<FileState>({
      id: 'file-1',
      name: 'Widget',
      ext: 'json',
      path: '/tmp/widget.json',
      content: 'draft'
    }),
    data: ref<string>('draft'),
    savedContent: ref<string>('saved')
  };
}

/**
 * 构建 Widget 最近文件记录。
 * @param context - 当前控制器快照
 * @returns Widget 最近文件记录
 */
function onBuildRecord(context: FileRecordContext<string>): StoredDocumentRecord {
  return {
    ...context.fileState,
    type: 'widget',
    url: `/widget/${context.fileState.id}`,
    title: `${context.fileState.name}.${context.fileState.ext}`,
    description: context.fileState.path || '未保存文件',
    savedContent: context.savedContent,
    modifiedAt: context.modifiedAt
  };
}

describe('useDraftPersistence', (): void => {
  beforeEach((): void => {
    getFileByIdMock.mockReset();
    updateFileMock.mockReset();
    addFileMock.mockReset();
  });

  it('updates an existing draft without depending on disk save strategy', async (): Promise<void> => {
    getFileByIdMock.mockResolvedValue({ id: 'file-1', type: 'widget' });
    const state = createState();
    const persistence = useDraftPersistence({ ...state, onBuildRecord, delay: 60_000 });

    persistence.onScheduleDraft();
    await persistence.onFlushDraft();

    expect(updateFileMock).toHaveBeenCalledWith(
      'file-1',
      expect.objectContaining({
        content: 'draft',
        type: 'widget',
        savedContent: 'saved',
        modifiedAt: expect.any(Number)
      })
    );
  });

  it('creates the recent record when the draft has no stored record', async (): Promise<void> => {
    getFileByIdMock.mockResolvedValue(undefined);
    const state = createState();
    const persistence = useDraftPersistence({ ...state, onBuildRecord, delay: 60_000 });

    persistence.onScheduleDraft();
    await persistence.onFlushDraft();

    expect(addFileMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'file-1', type: 'widget', content: 'draft' }));
  });

  it('reports a record builder failure without poisoning later draft writes', async (): Promise<void> => {
    getFileByIdMock.mockResolvedValue(undefined);
    const state = createState();
    const onBuild = vi.fn(onBuildRecord).mockImplementationOnce((): StoredDocumentRecord => {
      throw new Error('build failed');
    });
    const persistence = useDraftPersistence({ ...state, onBuildRecord: onBuild, delay: 60_000 });

    persistence.onScheduleDraft();
    await persistence.onFlushDraft();
    expect(persistence.draftError.value?.message).toBe('build failed');

    persistence.onScheduleDraft();
    await persistence.onFlushDraft();
    expect(addFileMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'file-1' }));
    expect(persistence.draftError.value).toBeNull();
  });
});
