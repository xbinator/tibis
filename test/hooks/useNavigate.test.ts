/**
 * @file useNavigate.test.ts
 * @description useNavigate 中通用 openFile 入口与文件选区意图写入测试。
 * @vitest-environment jsdom
 */

import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { StoredFile } from '@/shared/storage/files/types';

type OpenFileByIdMock = (id: string) => Promise<StoredFile | null>;
type OpenFileByPathMock = (path: string) => Promise<StoredFile | null>;

/** 模拟按路径打开文件。 */
const openFileByPathMock = vi.fn<OpenFileByPathMock>();

/** 模拟按文件 ID 打开文件。 */
const openFileByIdMock = vi.fn<OpenFileByIdMock>();

/** 模拟路由跳转。 */
const routerPushMock = vi.fn(async () => undefined);

/** 模拟错误提示。 */
const messageErrorMock = vi.fn();

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: routerPushMock
  })
}));

vi.mock('ant-design-vue', () => ({
  message: {
    error: messageErrorMock
  }
}));

vi.mock('@/hooks/useOpenFile', () => ({
  useOpenFile: () => ({
    openFileByPath: openFileByPathMock,
    openFileById: openFileByIdMock
  })
}));

describe('useNavigate', () => {
  beforeEach(() => {
    vi.resetModules();
    openFileByPathMock.mockReset();
    openFileByIdMock.mockReset();
    routerPushMock.mockReset();
    messageErrorMock.mockReset();
    setActivePinia(createPinia());
  });

  test('openFile opens by path and records a selection intent', async () => {
    const { useNavigate } = await import('@/hooks/useNavigate');
    const { useFileSelectionIntentStore } = await import('@/stores/editor/fileSelectionIntent');
    const fileSelectionIntentStore = useFileSelectionIntentStore();
    const { openFile } = useNavigate();

    openFileByPathMock.mockResolvedValue({
      id: 'file-1',
      path: '/tmp/demo.md',
      name: 'demo',
      ext: 'md',
      content: '',
      savedContent: ''
    });

    await openFile({
      filePath: '/tmp/demo.md',
      range: {
        startLine: 4,
        endLine: 6
      }
    });

    expect(openFileByPathMock).toHaveBeenCalledWith('/tmp/demo.md');
    expect(fileSelectionIntentStore.intent).toMatchObject({
      fileId: 'file-1',
      startLine: 4,
      endLine: 6
    });
  });

  test('openFile normalizes invalid line ranges before writing intent', async () => {
    const { useNavigate } = await import('@/hooks/useNavigate');
    const { useFileSelectionIntentStore } = await import('@/stores/editor/fileSelectionIntent');
    const fileSelectionIntentStore = useFileSelectionIntentStore();
    const { openFile } = useNavigate();

    openFileByIdMock.mockResolvedValue({
      id: 'draft-1',
      path: null,
      name: 'draft',
      ext: 'md',
      content: '',
      savedContent: ''
    });

    await openFile({
      fileId: 'draft-1',
      range: {
        startLine: 0,
        endLine: -2
      }
    });

    expect(fileSelectionIntentStore.intent).toMatchObject({
      fileId: 'draft-1',
      startLine: 1,
      endLine: 1
    });
  });

  test('openFile does not write intent when no range is provided', async () => {
    const { useNavigate } = await import('@/hooks/useNavigate');
    const { useFileSelectionIntentStore } = await import('@/stores/editor/fileSelectionIntent');
    const fileSelectionIntentStore = useFileSelectionIntentStore();
    const { openFile } = useNavigate();

    openFileByIdMock.mockResolvedValue({
      id: 'draft-1',
      path: null,
      name: 'draft',
      ext: 'md',
      content: '',
      savedContent: ''
    });

    await openFile({ fileId: 'draft-1' });

    expect(openFileByIdMock).toHaveBeenCalledWith('draft-1');
    expect(fileSelectionIntentStore.intent).toBeNull();
  });

  test('openFile reports file-not-found errors', async () => {
    const { useNavigate } = await import('@/hooks/useNavigate');
    const { openFile } = useNavigate();

    openFileByPathMock.mockResolvedValue(null);

    await openFile({ filePath: '/tmp/missing.md' });

    expect(messageErrorMock).toHaveBeenCalledWith('未找到引用文件');
  });
});
