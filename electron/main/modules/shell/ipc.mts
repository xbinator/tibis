/**
 * @file ipc.mts
 * @description Shell 命令安全分析与执行 IPC handler 注册。
 */
import type { ShellCommandRunRequest, ShellCommandSafetyRequest } from './types.mjs';
import type { IpcMainInvokeEvent } from 'electron';
import { ipcMain } from 'electron';
import { shellCommandRunner } from './runner.mjs';
import { analyzeShellCommandSafety } from './safety.mjs';

/** Shell 命令输出事件名称。 */
export const SHELL_COMMAND_OUTPUT_EVENT = 'shell:output';

/**
 * 注册 Shell 命令 IPC handlers。
 */
export function registerShellCommandHandlers(): void {
  ipcMain.handle('shell:analyze', async (_event: IpcMainInvokeEvent, request: ShellCommandSafetyRequest) => {
    return analyzeShellCommandSafety(request);
  });

  ipcMain.handle('shell:run', async (event: IpcMainInvokeEvent, request: ShellCommandRunRequest) => {
    return shellCommandRunner.run(request, (chunk) => {
      event.sender.send(SHELL_COMMAND_OUTPUT_EVENT, chunk);
    });
  });

  ipcMain.handle('shell:cancel', async (_event: IpcMainInvokeEvent, commandId: string) => {
    return shellCommandRunner.cancel(commandId);
  });
}
