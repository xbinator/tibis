/**
 * @file shell-ipc.test.ts
 * @description 验证 Shell 命令 IPC handler 注册。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** ipcMain.handle mock。 */
const handleMock = vi.fn();

vi.mock('electron', () => ({
  ipcMain: {
    handle: handleMock
  }
}));

describe('registerShellCommandHandlers', () => {
  beforeEach(() => {
    vi.resetModules();
    handleMock.mockReset();
  });

  it('registers shell command analysis, run and cancel channels', async () => {
    const { registerShellCommandHandlers } = await import('../../electron/main/modules/shell/ipc.mjs');

    registerShellCommandHandlers();

    expect(handleMock).toHaveBeenCalledWith('shell:analyze', expect.any(Function));
    expect(handleMock).toHaveBeenCalledWith('shell:run', expect.any(Function));
    expect(handleMock).toHaveBeenCalledWith('shell:cancel', expect.any(Function));
  });
});
