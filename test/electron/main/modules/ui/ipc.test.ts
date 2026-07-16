/**
 * @file ipc.test.ts
 * @description UI 层 IPC handler 注册测试，重点验证 ui:trashFile 跨平台路径规范化。
 */
import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerUiHandlers } from '../../../../../electron/main/modules/ui/ipc.mjs';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>(),
  trashItem: vi.fn<(filePath: string) => Promise<void>>(),
  showItemInFolder: vi.fn<(filePath: string) => void>(),
  openExternal: vi.fn<(url: string) => Promise<void>>()
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => Promise<unknown>): void => {
      mocks.handlers.set(channel, handler);
    }),
    on: vi.fn()
  },
  shell: {
    trashItem: mocks.trashItem,
    showItemInFolder: mocks.showItemInFolder,
    openExternal: mocks.openExternal
  },
  Menu: {
    getApplicationMenu: vi.fn(() => null)
  }
}));

vi.mock('../../../../../../electron/main/window.mjs', () => ({
  getFocusedWindow: vi.fn(() => null)
}));

vi.mock('../../../../../../electron/main/modules/ui/image-preview.mjs', () => ({
  getImagePreviewService: vi.fn(() => ({ previewImage: vi.fn() }))
}));

vi.mock('../../../../../../electron/main/modules/ui/shortcuts.mjs', () => ({
  updateShortcuts: vi.fn()
}));

describe('registerUiHandlers', (): void => {
  beforeEach((): void => {
    mocks.handlers.clear();
    mocks.trashItem.mockReset();
    mocks.showItemInFolder.mockReset();
    mocks.openExternal.mockReset();
    mocks.trashItem.mockResolvedValue(undefined);
    registerUiHandlers();
  });

  it('normalizes forward-slash paths to platform-native separators before calling shell.trashItem', async (): Promise<void> => {
    // 该用例验证 Windows 风格路径的正斜杠转换，仅在 Windows 平台有意义。
    if (process.platform !== 'win32') return;

    const handler = mocks.handlers.get('ui:trashFile');
    if (!handler) throw new Error('ui:trashFile handler was not registered');

    const inputPath = 'C:/Users/test/.tibis/widgets/weather';
    await handler({}, inputPath);

    expect(mocks.trashItem).toHaveBeenCalledTimes(1);
    const receivedPath = mocks.trashItem.mock.calls[0]?.[0] ?? '';
    // 路径必须是 platform 原生分隔符，且不能含正斜杠
    expect(receivedPath).not.toContain('/');
    expect(receivedPath).toBe(path.normalize(inputPath));
  });

  it('keeps backslash paths unchanged on Windows', async (): Promise<void> => {
    if (process.platform !== 'win32') return;

    const handler = mocks.handlers.get('ui:trashFile');
    if (!handler) throw new Error('ui:trashFile handler was not registered');

    const inputPath = 'C:\\Users\\test\\.tibis\\widgets\\weather';
    await handler({}, inputPath);

    expect(mocks.trashItem).toHaveBeenCalledWith(inputPath);
  });
});
