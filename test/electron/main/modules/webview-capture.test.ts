/**
 * @file webview-capture.test.ts
 * @description 验证 WebView 协议截图参数与主进程目标归属校验。
 */
import type { WebViewProtocolScreenshotRequest } from 'types/webview';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { captureWebviewProtocolScreenshot, createProtocolScreenshotParams } from '../../../../electron/main/modules/webview/capture.mts';

const fromIdMock = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  webContents: {
    fromId: fromIdMock
  }
}));

/**
 * 测试用 Electron Debugger 最小能力集合。
 */
interface TestDebugger {
  /** Debugger 是否已附加。 */
  isAttached: () => boolean;
  /** 附加 Debugger。 */
  attach: (version: string) => void;
  /** 执行 CDP 命令。 */
  sendCommand: (method: string, params: unknown) => Promise<unknown>;
  /** 分离 Debugger。 */
  detach: () => void;
}

/**
 * 测试用 WebContents 最小能力集合。
 */
interface TestWebContents {
  /** WebContents ID。 */
  id: number;
  /** 宿主 WebContents。 */
  hostWebContents: { id: number } | null;
  /** 是否已销毁。 */
  isDestroyed: () => boolean;
  /** Electron Debugger 能力。 */
  debugger: TestDebugger;
}

/**
 * 带宿主校验配置的协议截图函数签名。
 */
type CaptureWithHostGuard = (request: WebViewProtocolScreenshotRequest, options: { expectedHostWebContentsId: number }) => Promise<ArrayBuffer>;

/**
 * 创建测试用 WebContents。
 * @param hostWebContentsId - 宿主 WebContents ID
 * @returns WebContents 替身
 */
function createTestWebContents(hostWebContentsId: number): TestWebContents {
  return {
    id: 42,
    hostWebContents: { id: hostWebContentsId },
    isDestroyed: vi.fn(() => false),
    debugger: {
      isAttached: vi.fn(() => false),
      attach: vi.fn(),
      sendCommand: vi.fn().mockResolvedValue({ data: Buffer.from([1, 2, 3]).toString('base64') }),
      detach: vi.fn()
    }
  };
}

describe('webview protocol capture', () => {
  beforeEach((): void => {
    fromIdMock.mockReset();
  });

  it('normalizes selected element clip before calling Chrome DevTools Protocol', (): void => {
    const params = createProtocolScreenshotParams({
      x: 12.2,
      y: 90.7,
      width: 120.1,
      height: 160.6,
      scale: 1
    });

    expect(params).toEqual({
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: true,
      clip: {
        x: 12,
        y: 90,
        width: 121,
        height: 162,
        scale: 1
      }
    });
  });

  it('rejects protocol screenshot when target webContents belongs to another host', async (): Promise<void> => {
    const targetWebContents = createTestWebContents(100);
    fromIdMock.mockReturnValue(targetWebContents);
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

    await expect(
      (captureWebviewProtocolScreenshot as CaptureWithHostGuard)(request, {
        expectedHostWebContentsId: 200
      })
    ).rejects.toThrow('当前 WebView 页面不可截图');
    expect(targetWebContents.debugger.attach).not.toHaveBeenCalled();
    expect(targetWebContents.debugger.sendCommand).not.toHaveBeenCalled();
  });
});
