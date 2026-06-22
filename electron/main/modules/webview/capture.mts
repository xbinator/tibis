/**
 * @file capture.mts
 * @description 通过 Chrome DevTools Protocol 截取 WebView 页面区域。
 */
import { Buffer } from 'node:buffer';
import type { WebViewProtocolScreenshotClip, WebViewProtocolScreenshotRequest } from 'types/webview';
import { webContents, type WebContents } from 'electron';

/**
 * Chrome DevTools Protocol 截图参数。
 */
export interface ProtocolScreenshotParams {
  /** 图片格式 */
  format: 'png';
  /** 从渲染表面截取，避免窗口遮挡影响结果 */
  fromSurface: true;
  /** 允许截取当前视口之外的页面区域 */
  captureBeyondViewport: true;
  /** 页面坐标系中的裁剪区域 */
  clip: WebViewProtocolScreenshotClip;
}

/**
 * Chrome DevTools Protocol 截图返回值。
 */
interface ProtocolScreenshotResult {
  /** Base64 编码的 PNG 图片 */
  data: string;
}

/**
 * 协议截图执行配置。
 */
export interface ProtocolScreenshotOptions {
  /** 期望持有目标 WebContents 的宿主 WebContents ID */
  expectedHostWebContentsId?: number;
}

/**
 * 判断值是否为有限数字。
 * @param value - 待校验的值
 * @returns 是否为有限数字
 */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * 判断协议截图返回值是否包含 PNG 数据。
 * @param value - 待校验的值
 * @returns 是否为合法截图返回值
 */
function isProtocolScreenshotResult(value: unknown): value is ProtocolScreenshotResult {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const result = value as Partial<ProtocolScreenshotResult>;
  return typeof result.data === 'string' && result.data.length > 0;
}

/**
 * 校验并读取有限数字。
 * @param value - 待校验的值
 * @param fieldName - 字段名
 * @returns 有限数字
 */
function readFiniteNumber(value: number, fieldName: string): number {
  if (!isFiniteNumber(value)) {
    throw new Error(`无效的截图区域字段：${fieldName}`);
  }

  return value;
}

/**
 * 将 Node Buffer 转为独立 ArrayBuffer，避免传出底层共享缓冲区。
 * @param buffer - Node Buffer
 * @returns 独立 ArrayBuffer
 */
function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  const bytes = new Uint8Array(buffer.byteLength);
  bytes.set(buffer);
  return bytes.buffer;
}

/**
 * 归一化协议截图裁剪区域。
 * @param clip - 原始裁剪区域
 * @returns 归一化后的裁剪区域
 */
function normalizeProtocolScreenshotClip(clip: WebViewProtocolScreenshotClip): WebViewProtocolScreenshotClip {
  const x = Math.max(0, Math.floor(readFiniteNumber(clip.x, 'x')));
  const y = Math.max(0, Math.floor(readFiniteNumber(clip.y, 'y')));
  const right = Math.ceil(readFiniteNumber(clip.x, 'x') + readFiniteNumber(clip.width, 'width'));
  const bottom = Math.ceil(readFiniteNumber(clip.y, 'y') + readFiniteNumber(clip.height, 'height'));
  const width = Math.max(1, right - x);
  const height = Math.max(1, bottom - y);
  const scale = Math.max(0.01, readFiniteNumber(clip.scale, 'scale'));

  return {
    x,
    y,
    width,
    height,
    scale
  };
}

/**
 * 构建 Chrome DevTools Protocol 截图参数。
 * @param clip - 页面坐标系中的裁剪区域
 * @returns 协议截图参数
 */
export function createProtocolScreenshotParams(clip: WebViewProtocolScreenshotClip): ProtocolScreenshotParams {
  return {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: true,
    clip: normalizeProtocolScreenshotClip(clip)
  };
}

/**
 * 校验目标 WebContents 是否属于当前调用方宿主。
 * @param targetWebContents - 待截图的 WebContents
 * @param options - 协议截图执行配置
 */
function assertWebContentsBelongsToExpectedHost(targetWebContents: WebContents, options: ProtocolScreenshotOptions): void {
  const { expectedHostWebContentsId } = options;
  if (!expectedHostWebContentsId) {
    return;
  }

  if (targetWebContents.hostWebContents?.id !== expectedHostWebContentsId) {
    throw new Error('当前 WebView 页面不可截图');
  }
}

/**
 * 通过 Chrome DevTools Protocol 截取 WebView 页面区域。
 * @param request - 协议截图请求
 * @param options - 协议截图执行配置
 * @returns PNG 图片二进制
 */
export async function captureWebviewProtocolScreenshot(
  request: WebViewProtocolScreenshotRequest,
  options: ProtocolScreenshotOptions = {}
): Promise<ArrayBuffer> {
  const targetWebContents = webContents.fromId(request.webContentsId);
  if (!targetWebContents || targetWebContents.isDestroyed()) {
    throw new Error('当前 WebView 页面不可截图');
  }

  assertWebContentsBelongsToExpectedHost(targetWebContents, options);

  const debuggerWasAttached = targetWebContents.debugger.isAttached();
  if (!debuggerWasAttached) {
    targetWebContents.debugger.attach('1.3');
  }

  try {
    const result = (await targetWebContents.debugger.sendCommand('Page.captureScreenshot', createProtocolScreenshotParams(request.clip))) as unknown;
    if (!isProtocolScreenshotResult(result)) {
      throw new Error('协议截图返回数据无效');
    }

    return toArrayBuffer(Buffer.from(result.data, 'base64'));
  } finally {
    if (!debuggerWasAttached && targetWebContents.debugger.isAttached()) {
      targetWebContents.debugger.detach();
    }
  }
}
