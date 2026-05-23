/**
 * @file mcp-ipc.test.ts
 * @description 验证 MCP runtime IPC 注册。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const handleMock = vi.fn();

vi.mock('electron', () => ({
  ipcMain: {
    handle: handleMock
  }
}));

describe('registerMcpHandlers', () => {
  beforeEach(() => {
    vi.resetModules();
    handleMock.mockReset();
  });

  it('registers MCP status, cache and refresh channels', async () => {
    const { registerMcpHandlers } = await import('../../electron/main/modules/mcp/ipc.mjs');

    registerMcpHandlers();

    expect(handleMock).toHaveBeenCalledWith('tools:mcp:get-status', expect.any(Function));
    expect(handleMock).toHaveBeenCalledWith('tools:mcp:get-discovery-cache', expect.any(Function));
    expect(handleMock).toHaveBeenCalledWith('tools:mcp:refresh-discovery', expect.any(Function));
    expect(handleMock).toHaveBeenCalledWith('tools:mcp:connect', expect.any(Function));
    expect(handleMock).toHaveBeenCalledWith('tools:mcp:disconnect', expect.any(Function));
    expect(handleMock).toHaveBeenCalledWith('tools:mcp:restart', expect.any(Function));
  });
});
