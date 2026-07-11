/**
 * @file ipc.mts
 * @description ChatRuntime IPC handler 注册。
 */
import type {
  ChatRuntimeAbortInput,
  ChatRuntimeAutoNameInput,
  ChatRuntimeBridgeResponseInput,
  ChatRuntimeCompactInput,
  ChatRuntimeContinueInput,
  ChatRuntimeHandlerResult,
  ChatRuntimeRecoverySnapshot,
  ChatRuntimeSendInput,
  ChatRuntimeSubmitConfirmationInput,
  ChatRuntimeSubmitMessagePartInput,
  ChatRuntimeSubmitUserChoiceInput,
  ChatRuntimeSubmitToolResultInput
} from 'types/chat-runtime';
import { ipcMain } from 'electron';
import { chatRuntimeService } from './service.mjs';

/**
 * 从未知错误中读取稳定错误码。
 * @param error - 捕获到的错误
 * @returns 稳定错误码
 */
function getRuntimeErrorCode(error: unknown): string {
  if (error instanceof Error && 'code' in error) {
    const { code } = error as { code?: unknown };
    if (typeof code === 'string' && code.length > 0) return code;
  }

  return 'UNKNOWN';
}

/**
 * 将 runtime handler 结果包成统一 IPC 响应。
 * @param fn - runtime handler
 * @returns IPC handler
 */
function wrapRuntimeHandler<T>(fn: (...args: unknown[]) => Promise<T> | T): (...args: unknown[]) => Promise<ChatRuntimeHandlerResult<T>> {
  return async (...args: unknown[]): Promise<ChatRuntimeHandlerResult<T>> => {
    try {
      const result = await fn(...args);
      return { ok: true, data: result };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: message, code: getRuntimeErrorCode(error) };
    }
  };
}

/**
 * 注册 ChatRuntime IPC handler。
 */
export function registerChatRuntimeHandlers(): void {
  ipcMain.handle(
    'chat:runtime:list-active',
    wrapRuntimeHandler((): ChatRuntimeRecoverySnapshot[] => chatRuntimeService.listRecoverySnapshots())
  );

  ipcMain.handle(
    'chat:runtime:send',
    wrapRuntimeHandler((_event, input) => chatRuntimeService.send(input as ChatRuntimeSendInput))
  );

  ipcMain.handle(
    'chat:runtime:continue',
    wrapRuntimeHandler((_event, input) => chatRuntimeService.continue(input as ChatRuntimeContinueInput))
  );

  ipcMain.handle(
    'chat:runtime:submit-user-choice',
    wrapRuntimeHandler((_event, input) => chatRuntimeService.submitUserChoice(input as ChatRuntimeSubmitUserChoiceInput))
  );

  ipcMain.handle(
    'chat:runtime:submit-confirmation',
    wrapRuntimeHandler((_event, input) => chatRuntimeService.submitConfirmation(input as ChatRuntimeSubmitConfirmationInput))
  );

  ipcMain.handle(
    'chat:runtime:bridge-response',
    wrapRuntimeHandler((_event, input) => chatRuntimeService.submitBridgeResponse(input as ChatRuntimeBridgeResponseInput))
  );

  ipcMain.handle(
    'chat:runtime:auto-name',
    wrapRuntimeHandler((_event, input) => chatRuntimeService.autoName(input as ChatRuntimeAutoNameInput))
  );

  ipcMain.handle(
    'chat:runtime:abort',
    wrapRuntimeHandler((_event, input) => chatRuntimeService.abort(input as ChatRuntimeAbortInput))
  );

  ipcMain.handle(
    'chat:runtime:compact',
    wrapRuntimeHandler((_event, input) => chatRuntimeService.compact(input as ChatRuntimeCompactInput))
  );

  ipcMain.handle(
    'chat:runtime:tool-result',
    wrapRuntimeHandler((_event, input) => chatRuntimeService.submitToolResult(input as ChatRuntimeSubmitToolResultInput))
  );

  ipcMain.handle(
    'chat:runtime:message-part',
    wrapRuntimeHandler((_event, input) => chatRuntimeService.submitMessagePart(input as ChatRuntimeSubmitMessagePartInput))
  );
}
