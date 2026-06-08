/**
 * @file menu.test.ts
 * @description 验证 Electron 系统菜单模板包含帮助菜单更新检查入口。
 */
import { describe, expect, it, vi } from 'vitest';
import { buildAppMenuTemplate } from '../../../../../electron/main/modules/ui/menu.mts';

vi.mock('electron', () => ({
  app: { name: 'Tibis' },
  BrowserWindow: {
    getFocusedWindow: vi.fn(),
    getAllWindows: vi.fn(() => [])
  },
  Menu: {
    buildFromTemplate: vi.fn((template: unknown) => template),
    setApplicationMenu: vi.fn()
  }
}));

vi.mock('../../../../../electron/main/window.mjs', () => ({
  getWindow: vi.fn()
}));

describe('buildAppMenuTemplate', () => {
  it('adds check update action to the help menu', (): void => {
    const template = buildAppMenuTemplate(false, 'Tibis');
    const helpMenu = template.find((item) => item.label === '帮助');
    const submenu = Array.isArray(helpMenu?.submenu) ? helpMenu.submenu : [];
    const checkUpdateItem = submenu.find((item) => 'label' in item && item.label === '检查更新');

    expect(checkUpdateItem).toMatchObject({
      label: '检查更新'
    });
  });
});
