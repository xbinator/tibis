/**
 * @file webview-ipc.test.ts
 * @description 验证 WebView 主进程 IPC 截图边界。
 */
import type { WebViewProtocolScreenshotRequest } from 'types/webview';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { captureWebviewProtocolScreenshot } from '../../../../electron/main/modules/webview/capture.mjs';
import { registerWebviewHandlers } from '../../../../electron/main/modules/webview/ipc.mts';

const handleMock = vi.hoisted(() => vi.fn());
const captureWebviewProtocolScreenshotMock = vi.hoisted(() => vi.fn().mockResolvedValue(new ArrayBuffer(1)));

vi.mock('electron', () => ({
  ipcMain: {
    handle: handleMock
  },
  WebContentsView: vi.fn(),
  BrowserWindow: {
    getAllWindows: vi.fn(() => [])
  },
  session: {
    fromPartition: vi.fn(() => ({
      clearCache: vi.fn().mockResolvedValue(undefined)
    }))
  },
  shell: {
    openExternal: vi.fn()
  }
}));

vi.mock('../../../../electron/main/modules/webview/capture.mjs', () => ({
  captureWebviewProtocolScreenshot: captureWebviewProtocolScreenshotMock
}));

/**
 * 测试用 IPC 调用事件。
 */
interface TestIpcInvokeEvent {
  /** 发起 IPC 的宿主 WebContents。 */
  sender: {
    /** 宿主 WebContents ID。 */
    id: number;
  };
}

/**
 * WebView 协议截图 IPC 处理函数。
 */
type CaptureProtocolScreenshotHandler = (event: TestIpcInvokeEvent, request: WebViewProtocolScreenshotRequest) => Promise<ArrayBuffer>;

/**
 * 读取已注册的协议截图 IPC handler。
 * @returns 协议截图 IPC handler
 */
function getCaptureProtocolScreenshotHandler(): CaptureProtocolScreenshotHandler {
  const entry = handleMock.mock.calls.find(([channel]) => channel === 'webview:capture-protocol-screenshot');
  const handler = entry?.[1];

  if (typeof handler !== 'function') {
    throw new Error('capture handler should be registered');
  }

  return handler as CaptureProtocolScreenshotHandler;
}

describe('registerWebviewHandlers', () => {
  beforeEach((): void => {
    handleMock.mockClear();
    captureWebviewProtocolScreenshotMock.mockClear();
  });

  it('limits protocol screenshots to the invoking host webContents', async (): Promise<void> => {
    registerWebviewHandlers();
    const handler = getCaptureProtocolScreenshotHandler();
    const request: WebViewProtocolScreenshotRequest = {
      webContentsId: 42,
      clip: {
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        scale: 1
      }
    };

    await handler({ sender: { id: 88 } }, request);

    expect(captureWebviewProtocolScreenshot).toHaveBeenCalledWith(request, {
      expectedHostWebContentsId: 88
    });
  });
});
