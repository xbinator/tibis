/**
 * @file sources.test.ts
 * @description 验证 BCommandPanel 三类 source 的结果生成与行为绑定。
 * @vitest-environment jsdom
 */
import { h } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createJumpSource } from '@/components/BCommandPanel/sources/jump';
import { createModelSource } from '@/components/BCommandPanel/sources/model';
import { createRecentSource } from '@/components/BCommandPanel/sources/recent';
import type { CommandPanelActionItem } from '@/components/BCommandPanel/types';
import type { RecentRecord, StoredDocumentRecord, StoredFile } from '@/shared/storage';

const openFileMock = vi.fn<(_record: StoredDocumentRecord) => Promise<StoredDocumentRecord | null>>();
const openFileByPathMock = vi.fn<(_path: string) => Promise<StoredFile | null>>();
const openWebviewMock = vi.fn<(_url: URL) => void>();
const openChatMock = vi.fn<(_sessionId: string, _recordId: string) => Promise<void>>();
const removeFileMock = vi.fn<(_id: string) => Promise<void>>();
const removeTabMock = vi.fn<(_id: string) => void>();
const getPathStatusMock = vi.fn<(_path: string) => Promise<{ exists: boolean; isFile: boolean }>>();
const loadProvidersMock = vi.fn<() => Promise<void>>();
const loadChatModelMock = vi.fn<() => Promise<void>>();
const setChatModelMock = vi.fn<(_model: { providerId: string; modelId: string }) => Promise<void>>();

/**
 * 创建文件最近记录。
 * @param overrides - 覆盖字段
 * @returns 文件最近记录
 */
function fileRecord(overrides: Partial<Extract<RecentRecord, { type: 'file' }>> = {}): Extract<RecentRecord, { type: 'file' }> {
  return {
    type: 'file',
    id: 'file-1',
    path: '/tmp/example.md',
    content: '',
    name: 'example',
    ext: 'md',
    ...overrides
  };
}

/**
 * 创建聊天最近记录。
 * @param overrides - 覆盖字段
 * @returns 聊天最近记录
 */
function chatRecord(overrides: Partial<Extract<RecentRecord, { type: 'chat' }>> = {}): Extract<RecentRecord, { type: 'chat' }> {
  return {
    type: 'chat',
    id: 'chat:session-a',
    sessionId: 'session-a',
    title: '会话 A',
    createdAt: 1,
    openedAt: 2,
    ...overrides
  };
}

describe('BCommandPanel sources', (): void => {
  beforeEach((): void => {
    openFileMock.mockReset();
    openFileByPathMock.mockReset();
    openWebviewMock.mockReset();
    openChatMock.mockReset();
    removeFileMock.mockReset();
    removeTabMock.mockReset();
    getPathStatusMock.mockReset();
    loadProvidersMock.mockResolvedValue(undefined);
    loadChatModelMock.mockResolvedValue(undefined);
    setChatModelMock.mockResolvedValue(undefined);
  });

  it('filters jump commands and exposes routeInput without trailing space', async (): Promise<void> => {
    const source = createJumpSource();

    expect(await source.search('')).toEqual([
      {
        key: 'jump',
        items: [
          {
            key: 'jump:model',
            title: 'model',
            kind: 'jump',
            description: '切换当前使用的模型',
            hideIcon: true,
            routeInput: '> model'
          }
        ]
      }
    ]);

    const matchedGroups = await source.search('mo');
    expect(matchedGroups[0]?.items[0]?.key).toBe('jump:model');

    expect(await source.search('models')).toEqual([{ key: 'jump', items: [] }]);
  });

  it('creates recent file, url, and absolute path items', async (): Promise<void> => {
    getPathStatusMock.mockResolvedValue({ exists: true, isFile: true });
    const source = createRecentSource({
      getRecords: () => [fileRecord()],
      ensureLoaded: vi.fn(),
      openFile: openFileMock,
      openFileByPath: openFileByPathMock,
      openWebview: openWebviewMock,
      openChat: openChatMock,
      removeRecent: removeFileMock,
      removeTab: removeTabMock,
      getPathStatus: getPathStatusMock,
      pathDebounceMs: 0,
      renderRecentIcon: () => h('span', { class: 'recent-icon-stub' })
    });

    const urlGroups = await source.search('https://example.com/docs');
    expect(urlGroups[0]?.items[0]).toMatchObject({ kind: 'url', title: 'example.com', description: 'https://example.com/docs' });

    const pathGroups = await source.search('/tmp/sketch.md');
    expect(pathGroups[0]?.items[0]).toMatchObject({ kind: 'absolute-path', title: 'sketch.md', description: '/tmp/sketch.md', meta: '按路径打开' });

    const recentGroups = await source.search('');
    const fileItem = recentGroups[0]?.items.find((item) => item.kind === 'file') as CommandPanelActionItem | undefined;
    expect(fileItem?.removable).toBe(true);
    await fileItem?.onRemove?.();
    expect(removeFileMock).toHaveBeenCalledWith('file-1');
    expect(removeTabMock).toHaveBeenCalledWith('file-1');
  });

  it('does not match file records by hidden content', async (): Promise<void> => {
    const source = createRecentSource({
      getRecords: () => [fileRecord({ name: 'visible-title', path: '/tmp/visible-title.md', content: 'hidden-needle' })],
      ensureLoaded: vi.fn(),
      openFile: openFileMock,
      openFileByPath: openFileByPathMock,
      openWebview: openWebviewMock,
      openChat: openChatMock,
      removeRecent: removeFileMock,
      removeTab: removeTabMock,
      getPathStatus: getPathStatusMock,
      pathDebounceMs: 0,
      renderRecentIcon: () => h('span', { class: 'recent-icon-stub' })
    });

    const groups = await source.search('hidden-needle');

    expect(groups).toEqual([{ key: 'recent', items: [] }]);
  });

  it('creates chat recent items that open sessions without closing chat tabs', async (): Promise<void> => {
    const source = createRecentSource({
      getRecords: () => [chatRecord()],
      ensureLoaded: vi.fn(),
      openFile: openFileMock,
      openFileByPath: openFileByPathMock,
      openWebview: openWebviewMock,
      openChat: openChatMock,
      removeRecent: removeFileMock,
      removeTab: removeTabMock,
      getPathStatus: getPathStatusMock,
      pathDebounceMs: 0,
      renderRecentIcon: () => h('span', { class: 'recent-icon-stub' })
    });

    const groups = await source.search('会话');
    const chatItem = groups[0]?.items[0] as CommandPanelActionItem | undefined;

    expect(chatItem).toMatchObject({ kind: 'chat', title: '会话 A', description: '聊天会话', removable: true });

    await chatItem?.onSelect();
    expect(openChatMock).toHaveBeenCalledWith('session-a', 'chat:session-a');

    await chatItem?.onRemove?.();
    expect(removeFileMock).toHaveBeenCalledWith('chat:session-a');
    expect(removeTabMock).not.toHaveBeenCalled();
  });

  it('creates model groups and marks current chat model active', async (): Promise<void> => {
    const source = createModelSource({
      loadProviders: loadProvidersMock,
      loadChatModel: loadChatModelMock,
      setChatModel: setChatModelMock,
      getAvailableModels: () => [
        {
          providerId: 'openai',
          providerName: 'OpenAI',
          models: [
            { value: 'openai:gpt-4o', modelId: 'gpt-4o', modelName: 'GPT 4o' },
            { value: 'openai:gpt-4.1', modelId: 'gpt-4.1', modelName: 'GPT 4.1' }
          ]
        }
      ],
      getCurrentModel: () => ({ providerId: 'openai', modelId: 'gpt-4o' }),
      renderModelIcon: () => h('span', { class: 'model-icon-stub' })
    });

    await source.load();
    const groups = await source.search('4o');

    expect(loadProvidersMock).toHaveBeenCalled();
    expect(loadChatModelMock).toHaveBeenCalled();
    expect(groups[0]).toMatchObject({ key: 'openai', title: 'OpenAI' });
    expect(groups[0]?.items).toHaveLength(1);
    expect(groups[0]?.items[0]).toMatchObject({ kind: 'model', title: 'GPT 4o', active: true });
  });
});
