/**
 * @file recent.test.ts
 * @description 验证最近记录 Store 对聊天记录的缓存更新行为。
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatRecentRecord, RecentRecord } from '@/shared/storage';
import { useRecentStore } from '@/stores/workspace/recent';

const storageMocks = vi.hoisted(() => ({
  addChatRecord: vi.fn<(_sessionId: string, _title: string) => Promise<ChatRecentRecord>>(),
  touchChatRecord: vi.fn<(_id: string) => Promise<ChatRecentRecord>>(),
  updateChatRecordTitle: vi.fn<(_sessionId: string, _title: string) => Promise<ChatRecentRecord | null>>()
}));
const nativeMocks = vi.hoisted(() => ({
  syncRecentFiles: vi.fn<() => Promise<void>>()
}));

vi.mock('@/shared/platform', () => ({
  native: nativeMocks
}));

vi.mock('@/shared/storage', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/shared/storage')>();

  return {
    ...original,
    recentFilesStorage: {
      ...original.recentFilesStorage,
      addChatRecord: storageMocks.addChatRecord,
      touchChatRecord: storageMocks.touchChatRecord,
      updateChatRecordTitle: storageMocks.updateChatRecordTitle
    }
  };
});

describe('useRecentStore chat records', (): void => {
  beforeEach((): void => {
    setActivePinia(createPinia());
    localStorage.clear();
    storageMocks.addChatRecord.mockReset();
    storageMocks.touchChatRecord.mockReset();
    storageMocks.updateChatRecordTitle.mockReset();
    nativeMocks.syncRecentFiles.mockReset();
    nativeMocks.syncRecentFiles.mockResolvedValue(undefined);
  });

  it('adds chat records and updates the in-memory recent list', async (): Promise<void> => {
    const store = useRecentStore();
    const record: ChatRecentRecord = {
      type: 'chat',
      id: 'session-a',
      url: '/chat/session-a',
      title: '会话 A',
      description: '聊天会话',
      createdAt: 1,
      openedAt: 2
    };
    store.recentRecords = [];
    storageMocks.addChatRecord.mockResolvedValue(record);

    const result = await store.addChatRecord('session-a', '会话 A');

    expect(result).toEqual(record);
    expect(storageMocks.addChatRecord).toHaveBeenCalledWith('session-a', '会话 A');
    expect(store.recentRecords).toEqual([record]);
  });

  it('touches chat records and moves them to the top of the in-memory recent list', async (): Promise<void> => {
    const store = useRecentStore();
    const oldRecord: ChatRecentRecord = {
      type: 'chat',
      id: 'session-a',
      url: '/chat/session-a',
      title: '会话 A',
      description: '聊天会话',
      createdAt: 1,
      openedAt: 2
    };
    const nextRecord: ChatRecentRecord = {
      ...oldRecord,
      openedAt: 5
    };
    store.recentRecords = [
      {
        type: 'chat',
        id: 'session-b',
        url: '/chat/session-b',
        title: '会话 B',
        description: '聊天会话',
        createdAt: 1,
        openedAt: 4
      },
      oldRecord
    ];
    storageMocks.touchChatRecord.mockResolvedValue(nextRecord);

    const result = await store.touchChatRecord('chat:session-a');

    expect(result).toEqual(nextRecord);
    expect(storageMocks.touchChatRecord).toHaveBeenCalledWith('chat:session-a');
    expect(store.recentRecords[0]).toEqual(nextRecord);
  });

  it('patches chat recent titles when the record already exists', async (): Promise<void> => {
    const store = useRecentStore();
    const record: ChatRecentRecord = {
      type: 'chat',
      id: 'session-a',
      url: '/chat/session-a',
      title: '新标题',
      description: '聊天会话',
      createdAt: 1,
      openedAt: 2
    };
    store.recentRecords = [{ ...record, title: '旧标题' }];
    storageMocks.updateChatRecordTitle.mockResolvedValue(record);

    const result = await store.updateChatRecordTitle('session-a', '新标题');

    expect(result).toEqual(record);
    expect(storageMocks.updateChatRecordTitle).toHaveBeenCalledWith('session-a', '新标题');
    expect(store.recentRecords).toEqual([record]);
  });

  it('leaves the cache untouched when a chat recent title has no matching record', async (): Promise<void> => {
    const store = useRecentStore();
    store.recentRecords = [];
    storageMocks.updateChatRecordTitle.mockResolvedValue(null);

    const result = await store.updateChatRecordTitle('session-a', '新标题');

    expect(result).toBeNull();
    expect(store.recentRecords).toEqual([]);
  });

  it('keeps chat cache entries when removing a bare file id with the same value', (): void => {
    const store = useRecentStore();
    const fileRecord: RecentRecord = {
      type: 'file',
      id: 'shared-id',
      url: '/editor/shared-id',
      title: 'Untitled.md',
      description: '未保存文件',
      path: null,
      content: '',
      savedContent: '',
      name: 'Untitled',
      ext: 'md',
      createdAt: 1,
      openedAt: 2
    };
    const chatRecord: RecentRecord = {
      type: 'chat',
      id: 'shared-id',
      url: '/chat/shared-id',
      title: '同 ID 会话',
      description: '聊天会话',
      createdAt: 3,
      openedAt: 4
    };
    store.recentRecords = [fileRecord, chatRecord];

    store.removeCacheEntries(['shared-id']);

    expect(store.recentRecords).toEqual([chatRecord]);
  });
});
