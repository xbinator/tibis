/**
 * @file ipc.test.ts
 * @description Shell IPC 同时转发 pipe 输出和 PTY 有序事件测试。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerShellCommandHandlers } from '../../../../../electron/main/modules/shell/ipc.mts';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>(),
  run: vi.fn(),
  cancel: vi.fn()
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => Promise<unknown>): void => {
      mocks.handlers.set(channel, handler);
    })
  }
}));

vi.mock('../../../../../electron/main/modules/shell/runner.mjs', () => ({
  shellCommandRunner: { run: mocks.run, cancel: mocks.cancel }
}));

vi.mock('../../../../../electron/main/modules/shell/safety.mjs', () => ({
  analyzeShellCommandSafety: vi.fn()
}));

describe('Shell IPC events', (): void => {
  beforeEach((): void => {
    mocks.handlers.clear();
    mocks.run.mockReset();
    registerShellCommandHandlers();
  });

  it('forwards ordered PTY events on the invoking renderer sender', async (): Promise<void> => {
    const result = { commandId: 'command-1' };
    const send = vi.fn();
    mocks.run.mockImplementation(async (_request, _outputSink, eventSink): Promise<unknown> => {
      eventSink({ commandId: 'command-1', sequence: 1, createdAt: 'now', event: { type: 'terminal_update', content: 'screen' } });
      return result;
    });
    const handler = mocks.handlers.get('shell:run');
    if (!handler) throw new Error('shell:run handler missing');

    const received = await handler({ sender: { send } }, { commandId: 'command-1' });

    expect(send).toHaveBeenCalledWith('shell:run-event', expect.objectContaining({ commandId: 'command-1' }));
    expect(received).toBe(result);
  });
});
