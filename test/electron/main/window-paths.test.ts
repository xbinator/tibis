/**
 * @file window-paths.test.ts
 * @description Electron 主窗口资源路径解析测试。
 */
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { resolveRendererIndexPath } from '../../../electron/main/window.mts';

vi.mock('electron', () => ({
  app: { isPackaged: true },
  BrowserWindow: vi.fn()
}));

vi.mock('../../../electron/main/modules/webview/ipc.mjs', () => ({
  normalizeAttachedWebviewUrl: (url: string): string => url,
  sanitizeAttachedWebPreferences: (preferences: Record<string, unknown>): Record<string, unknown> => preferences
}));

describe('resolveRendererIndexPath', (): void => {
  it('resolves the packaged renderer entry outside dist-electron output', (): void => {
    const mainModuleDir = path.join('/Applications/Tibis.app/Contents/Resources/app.asar', 'dist-electron/electron/main');

    expect(resolveRendererIndexPath(mainModuleDir)).toBe(path.join('/Applications/Tibis.app/Contents/Resources/app.asar', 'dist/index.html'));
  });

  it('resolves the development renderer entry from the repository root', (): void => {
    const mainModuleDir = path.join(process.cwd(), 'electron/main');

    expect(resolveRendererIndexPath(mainModuleDir)).toBe(path.join(process.cwd(), 'dist/index.html'));
  });
});
