/**
 * @file ipc.mts
 * @description 平台托管 request IPC 代理。
 */
import type { IpcMainInvokeEvent } from 'electron';
import type { RequestInput } from 'types/request';
import { ipcMain } from 'electron';
import { runRequest } from './service.mjs';

/**
 * 注册平台托管 request IPC handler。
 */
export function registerRequestHandlers(): void {
  ipcMain.handle('request:send', async (_event: IpcMainInvokeEvent, request: RequestInput) => runRequest(request));
}
