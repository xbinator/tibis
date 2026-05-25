/**
 * @file mcp-ipc.test.ts
 * @description 验证 MCP runtime IPC 注册。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const handleMock = vi.fn();

vi.mock('electron', () => ({
  ipcMain: {
    handle: handleMock
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => [])
  }
}));

vi.mock('../../electron/main/modules/logger/service.mjs', () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}));

vi.mock('../../electron/main/modules/store/service.mjs', () => ({
  getStore: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn()
  }))
}));

describe('registerMcpHandlers', () => {
  beforeEach(() => {
    vi.resetModules();
    handleMock.mockReset();
  });

  it('registers MCP status, cache, refresh and OAuth channels', async () => {
    const { registerMcpHandlers } = await import('../../electron/main/modules/mcp/ipc.mjs');

    registerMcpHandlers();

    expect(handleMock).toHaveBeenCalledWith('tools:mcp:get-status', expect.any(Function));
    expect(handleMock).toHaveBeenCalledWith('tools:mcp:get-discovery-cache', expect.any(Function));
    expect(handleMock).toHaveBeenCalledWith('tools:mcp:refresh-discovery', expect.any(Function));
    expect(handleMock).toHaveBeenCalledWith('tools:mcp:connect', expect.any(Function));
    expect(handleMock).toHaveBeenCalledWith('tools:mcp:disconnect', expect.any(Function));
    expect(handleMock).toHaveBeenCalledWith('tools:mcp:restart', expect.any(Function));
    expect(handleMock).toHaveBeenCalledWith('tools:mcp:oauth:start', expect.any(Function));
    expect(handleMock).toHaveBeenCalledWith('tools:mcp:oauth:clear', expect.any(Function));
  });
});
