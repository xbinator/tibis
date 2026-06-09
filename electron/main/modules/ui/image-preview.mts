/**
 * @file image-preview.mts
 * @description Electron 图片预览服务，macOS 使用系统原生预览，其他平台使用独立 BrowserWindow。
 */
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { ElectronImagePreviewRequest, ElectronImagePreviewResult } from 'types/electron-api';
import { app, BrowserWindow, shell } from 'electron';

/**
 * 图片 MIME 类型到文件扩展名的映射。
 */
const IMAGE_EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/tiff': 'tiff',
  'image/webp': 'webp'
};

/** 图片预览临时目录名称。 */
const PREVIEW_TEMP_DIR_NAME = 'tibis-image-preview';

/** 预览缓存文件最大保留时间。 */
const PREVIEW_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** 远程图片下载超时时间。 */
const REMOTE_IMAGE_FETCH_TIMEOUT_MS = 15_000;

/** 远程图片最大下载体积。 */
const REMOTE_IMAGE_MAX_BYTES = 50 * 1024 * 1024;

/**
 * Electron 图片预览窗口的最小能力。
 */
export interface ImagePreviewWindow {
  /**
   * 加载预览页面 URL。
   * @param url - 预览页面 URL
   */
  loadURL(url: string): Promise<void>;
}

/**
 * 创建图片预览临时目录的函数。
 */
export type MakeImagePreviewDirectory = (directoryPath: string, options: { recursive: true }) => Promise<unknown>;

/**
 * 写入图片预览临时文件的函数。
 */
export type WriteImagePreviewFile = (filePath: string, data: Buffer) => Promise<unknown>;

/**
 * 读取图片预览临时目录的函数。
 */
export type ReadImagePreviewDirectory = (directoryPath: string) => Promise<string[]>;

/**
 * 图片预览临时文件状态。
 */
export interface ImagePreviewFileStat {
  /** 是否为普通文件 */
  isFile(): boolean;
  /** 最后修改时间，单位毫秒 */
  mtimeMs: number;
}

/**
 * 读取图片预览临时文件状态的函数。
 */
export type StatImagePreviewFile = (filePath: string) => Promise<ImagePreviewFileStat>;

/**
 * 删除图片预览临时文件的函数。
 */
export type UnlinkImagePreviewFile = (filePath: string) => Promise<unknown>;

/**
 * 获取当前时间戳的函数。
 */
export type ImagePreviewNow = () => number;

/**
 * 远程图片下载结果。
 */
export interface RemoteImagePreviewFile {
  /** 图片二进制内容 */
  buffer: Buffer;
  /** 服务端返回的 MIME 类型 */
  mimeType?: string;
}

/**
 * 下载远程图片的函数。
 */
export type FetchRemoteImagePreviewFile = (url: string) => Promise<RemoteImagePreviewFile>;

/**
 * 下载远程图片并限制超时与体积。
 * @param url - 远程图片 URL
 * @returns 远程图片内容
 */
export async function fetchRemoteImageWithLimits(url: string): Promise<RemoteImagePreviewFile> {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), REMOTE_IMAGE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: abortController.signal });
    if (!response.ok) {
      throw new Error(`图片下载失败: ${response.status}`);
    }

    const contentLength = Number(response.headers.get('content-length') || '0');
    if (contentLength > REMOTE_IMAGE_MAX_BYTES) {
      throw new Error(`图片过大: ${contentLength}`);
    }

    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim();
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > REMOTE_IMAGE_MAX_BYTES) {
      throw new Error(`图片过大: ${buffer.byteLength}`);
    }

    return { buffer, mimeType: contentType || undefined };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 使用系统默认应用打开本地图片路径的函数。
 */
export type OpenImagePreviewPath = (filePath: string) => Promise<string>;

/**
 * 图片预览服务依赖，便于单元测试注入平台和 IO 能力。
 */
export interface ImagePreviewServiceDependencies {
  /** 当前平台标识 */
  platform: NodeJS.Platform;
  /** 临时目录 */
  tempDir: string;
  /** 创建目录 */
  mkdir: MakeImagePreviewDirectory;
  /** 读取目录 */
  readdir: ReadImagePreviewDirectory;
  /** 读取文件状态 */
  stat: StatImagePreviewFile;
  /** 删除文件 */
  unlink: UnlinkImagePreviewFile;
  /** 当前时间戳 */
  now: ImagePreviewNow;
  /** 写入文件 */
  writeFile: WriteImagePreviewFile;
  /** 下载远程图片 */
  fetchRemoteImage: FetchRemoteImagePreviewFile;
  /** 使用系统默认应用打开路径 */
  openPath: OpenImagePreviewPath;
  /** 创建 Electron 预览窗口 */
  createWindow: (options: Electron.BrowserWindowConstructorOptions) => ImagePreviewWindow;
}

/**
 * 图片预览服务。
 */
export interface ImagePreviewService {
  /**
   * 根据平台打开图片预览。
   * @param request - 图片预览请求
   * @returns 图片预览结果
   */
  previewImage(request: ElectronImagePreviewRequest): Promise<ElectronImagePreviewResult>;
}

/**
 * 解析后的 data URL 图片。
 */
interface ParsedDataUrlImage {
  /** 图片 MIME 类型 */
  mimeType: string;
  /** 图片二进制内容 */
  buffer: Buffer;
}

/**
 * 判断图片来源是否为 HTTP(S) URL。
 * @param src - 图片来源
 * @returns 是否为远程 URL
 */
function isRemoteUrl(src: string): boolean {
  return /^https?:\/\//i.test(src);
}

/**
 * 判断图片来源是否为 data URL。
 * @param src - 图片来源
 * @returns 是否为 data URL
 */
function isDataUrl(src: string): boolean {
  return /^data:/i.test(src);
}

/**
 * 解析 base64 图片 data URL。
 * @param src - 图片 data URL
 * @returns 解析后的图片；非 base64 图片 data URL 时返回 null
 */
function parseDataUrlImage(src: string): ParsedDataUrlImage | null {
  const match = /^data:([^;,]+);base64,(.*)$/i.exec(src);
  if (!match) return null;

  const mimeType = match[1].toLowerCase();
  if (!mimeType.startsWith('image/')) return null;

  return {
    mimeType,
    buffer: Buffer.from(match[2], 'base64')
  };
}

/**
 * 从文件名或 MIME 类型推断图片扩展名。
 * @param name - 展示文件名
 * @param mimeType - 图片 MIME 类型
 * @returns 图片扩展名
 */
function resolveImageExtension(name: string | undefined, mimeType: string | undefined): string {
  const nameExtension = name ? path.extname(name).replace(/^\./, '').toLowerCase() : '';
  if (/^[a-z0-9]{1,8}$/.test(nameExtension)) return nameExtension;

  const normalizedMimeType = mimeType?.toLowerCase();
  if (normalizedMimeType && IMAGE_EXTENSION_BY_MIME_TYPE[normalizedMimeType]) {
    return IMAGE_EXTENSION_BY_MIME_TYPE[normalizedMimeType];
  }

  return 'png';
}

/**
 * 从远程图片 URL 推断展示文件名。
 * @param src - 远程图片 URL
 * @returns URL 路径中的文件名；无法解析时返回 undefined
 */
function resolveRemoteImageName(src: string): string | undefined {
  try {
    const url = new URL(src);
    const basename = path.basename(url.pathname);
    return basename || undefined;
  } catch {
    return undefined;
  }
}

/**
 * 获取图片预览临时目录路径。
 * @param deps - 图片预览服务依赖
 * @returns 图片预览临时目录路径
 */
function getPreviewTempDirectory(deps: ImagePreviewServiceDependencies): string {
  return path.join(deps.tempDir, PREVIEW_TEMP_DIR_NAME);
}

/**
 * 获取图片预览临时文件路径。
 * @param deps - 图片预览服务依赖
 * @param src - 图片来源
 * @param name - 展示文件名
 * @param mimeType - 图片 MIME 类型
 * @returns 图片预览临时文件路径
 */
function getPreviewTempFilePath(deps: ImagePreviewServiceDependencies, src: string, name: string | undefined, mimeType: string | undefined): string {
  const previewDir = getPreviewTempDirectory(deps);
  const extension = resolveImageExtension(name, mimeType);
  const hash = createHash('sha256').update(src).digest('hex').slice(0, 20);

  return path.join(previewDir, `${hash}.${extension}`);
}

/**
 * 获取图片来源对应的预览缓存文件名前缀。
 * @param src - 图片来源
 * @returns 缓存文件名前缀
 */
function getPreviewTempFilePrefix(src: string): string {
  return createHash('sha256').update(src).digest('hex').slice(0, 20);
}

/**
 * 判断预览缓存文件是否仍在有效期内。
 * @param deps - 图片预览服务依赖
 * @param fileStat - 文件状态
 * @returns 是否有效
 */
function isPreviewTempFileFresh(deps: ImagePreviewServiceDependencies, fileStat: ImagePreviewFileStat): boolean {
  return deps.now() - fileStat.mtimeMs <= PREVIEW_CACHE_MAX_AGE_MS;
}

/**
 * 获取已存在的预览临时文件。
 * @param deps - 图片预览服务依赖
 * @param previewPath - 图片预览临时文件路径
 * @returns 已存在的普通文件路径；不存在时返回 null
 */
async function getExistingPreviewTempFile(deps: ImagePreviewServiceDependencies, previewPath: string): Promise<string | null> {
  try {
    const fileStat = await deps.stat(previewPath);
    if (!fileStat.isFile()) return null;
    if (isPreviewTempFileFresh(deps, fileStat)) return previewPath;

    await deps.unlink(previewPath).catch(() => undefined);
    return null;
  } catch {
    return null;
  }
}

/**
 * 按图片来源 hash 前缀查找已存在的预览临时文件。
 * @param deps - 图片预览服务依赖
 * @param src - 图片来源
 * @returns 已存在的普通文件路径；不存在时返回 null
 */
async function findExistingPreviewTempFileBySource(deps: ImagePreviewServiceDependencies, src: string): Promise<string | null> {
  const previewDir = getPreviewTempDirectory(deps);
  const filenamePrefix = `${getPreviewTempFilePrefix(src)}.`;
  let filenames: string[] = [];

  try {
    filenames = await deps.readdir(previewDir);
  } catch {
    return null;
  }

  const candidatePaths = filenames.filter((filename) => filename.startsWith(filenamePrefix)).map((filename) => path.join(previewDir, filename));
  const existingPaths = await Promise.all(candidatePaths.map((filePath) => getExistingPreviewTempFile(deps, filePath)));

  return existingPaths.find((filePath): filePath is string => Boolean(filePath)) ?? null;
}

/**
 * 清理过期的图片预览临时文件。
 * @param deps - 图片预览服务依赖
 */
async function cleanupExpiredPreviewTempFiles(deps: ImagePreviewServiceDependencies): Promise<void> {
  const previewDir = getPreviewTempDirectory(deps);
  let filenames: string[] = [];

  try {
    filenames = await deps.readdir(previewDir);
  } catch {
    return;
  }

  await Promise.all(
    filenames.map(async (filename) => {
      const filePath = path.join(previewDir, filename);

      try {
        const fileStat = await deps.stat(filePath);
        if (!fileStat.isFile()) return;
        if (deps.now() - fileStat.mtimeMs <= PREVIEW_CACHE_MAX_AGE_MS) return;

        await deps.unlink(filePath);
      } catch {
        // 单个文件清理失败不应影响当前预览流程。
      }
    })
  );
}

/**
 * 将图片二进制写入临时文件。
 * @param deps - 图片预览服务依赖
 * @param src - 图片来源，用于生成稳定文件名
 * @param name - 展示文件名
 * @param mimeType - 图片 MIME 类型
 * @param buffer - 图片二进制内容
 * @returns 临时图片路径
 */
async function writeImageBufferToTempFile(
  deps: ImagePreviewServiceDependencies,
  src: string,
  name: string | undefined,
  mimeType: string | undefined,
  buffer: Buffer
): Promise<string> {
  const previewDir = getPreviewTempDirectory(deps);
  const previewPath = getPreviewTempFilePath(deps, src, name, mimeType);
  const existingPreviewPath = await getExistingPreviewTempFile(deps, previewPath);
  if (existingPreviewPath) return existingPreviewPath;

  await cleanupExpiredPreviewTempFiles(deps);
  await deps.mkdir(previewDir, { recursive: true });
  await deps.writeFile(previewPath, buffer);

  return previewPath;
}

/**
 * 将 data URL 图片写入临时文件。
 * @param deps - 图片预览服务依赖
 * @param request - 图片预览请求
 * @param parsedImage - 已解析图片
 * @returns 临时图片路径
 */
async function writeDataUrlToTempFile(
  deps: ImagePreviewServiceDependencies,
  request: ElectronImagePreviewRequest,
  parsedImage: ParsedDataUrlImage
): Promise<string> {
  return writeImageBufferToTempFile(deps, request.src, request.name, request.mimeType || parsedImage.mimeType, parsedImage.buffer);
}

/**
 * 将远程图片下载并写入临时文件。
 * @param deps - 图片预览服务依赖
 * @param request - 图片预览请求
 * @returns 临时图片路径
 */
async function writeRemoteUrlToTempFile(deps: ImagePreviewServiceDependencies, request: ElectronImagePreviewRequest): Promise<string> {
  const filename = request.name || resolveRemoteImageName(request.src);
  const cachedPath = await getExistingPreviewTempFile(deps, getPreviewTempFilePath(deps, request.src, filename, request.mimeType));
  if (cachedPath) return cachedPath;

  const sourceCachedPath = await findExistingPreviewTempFileBySource(deps, request.src);
  if (sourceCachedPath) return sourceCachedPath;

  const remoteImage = await deps.fetchRemoteImage(request.src);

  return writeImageBufferToTempFile(deps, request.src, filename, request.mimeType || remoteImage.mimeType, remoteImage.buffer);
}

/**
 * 将本地来源规范化为文件路径。
 * @param src - 图片来源
 * @returns 本地文件路径；无法作为本地路径处理时返回 null
 */
function normalizeLocalImagePath(src: string): string | null {
  if (isDataUrl(src) || isRemoteUrl(src)) return null;

  if (/^file:\/\//i.test(src)) {
    return fileURLToPath(src);
  }

  return src;
}

/**
 * 将图片来源转换为浏览器窗口可加载的 src。
 * @param src - 图片来源
 * @returns HTML 图片 src
 */
function toHtmlImageSource(src: string): string {
  if (isDataUrl(src) || isRemoteUrl(src) || /^file:\/\//i.test(src)) {
    return src;
  }

  return pathToFileURL(src).href;
}

/**
 * 转义 HTML 属性值。
 * @param value - 原始值
 * @returns 已转义属性值
 */
function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 构造独立预览窗口 HTML。
 * @param request - 图片预览请求
 * @returns data URL 页面
 */
function buildPreviewPageUrl(request: ElectronImagePreviewRequest): string {
  const imageSrc = escapeHtmlAttribute(toHtmlImageSource(request.src));
  const title = escapeHtmlAttribute(request.name || '图片预览');
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    html,
    body {
      width: 100%;
      height: 100%;
      margin: 0;
      background: #111;
    }

    body {
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }

    img {
      max-width: 100vw;
      max-height: 100vh;
      object-fit: contain;
      user-select: none;
    }
  </style>
</head>
<body>
  <img src="${imageSrc}" alt="${title}">
</body>
</html>`;

  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

/**
 * 创建图片预览服务。
 * @param deps - 图片预览服务依赖
 * @returns 图片预览服务
 */
export function createImagePreviewService(deps: ImagePreviewServiceDependencies): ImagePreviewService {
  /** 正在下载/写入的远程图片临时文件任务。 */
  const pendingRemotePreviewPaths = new Map<string, Promise<string>>();

  /**
   * 获取远程图片预览路径，并复用同来源的并发下载任务。
   * @param request - 图片预览请求
   * @returns 远程图片临时文件路径
   */
  function getRemotePreviewPath(request: ElectronImagePreviewRequest): Promise<string> {
    const pendingPreviewPath = pendingRemotePreviewPaths.get(request.src);
    if (pendingPreviewPath) return pendingPreviewPath;

    const previewPath = writeRemoteUrlToTempFile(deps, request).finally(() => {
      pendingRemotePreviewPaths.delete(request.src);
    });
    pendingRemotePreviewPaths.set(request.src, previewPath);

    return previewPath;
  }

  /**
   * 获取 macOS 可交给系统预览打开的本地图片路径。
   * @param request - 图片预览请求
   * @returns 本地图片路径；不支持时返回 null
   */
  async function resolveMacPreviewPath(request: ElectronImagePreviewRequest): Promise<string | null> {
    const parsedImage = parseDataUrlImage(request.src);
    if (parsedImage) {
      return writeDataUrlToTempFile(deps, request, parsedImage);
    }

    if (isRemoteUrl(request.src)) {
      return getRemotePreviewPath(request);
    }

    return normalizeLocalImagePath(request.src);
  }

  /**
   * 使用独立窗口打开图片预览。
   * @param request - 图片预览请求
   * @returns 图片预览结果
   */
  async function previewInWindow(request: ElectronImagePreviewRequest): Promise<ElectronImagePreviewResult> {
    const window = deps.createWindow({
      width: 960,
      height: 720,
      minWidth: 360,
      minHeight: 300,
      title: request.name || '图片预览',
      autoHideMenuBar: true,
      backgroundColor: '#111111',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });

    await window.loadURL(buildPreviewPageUrl(request));

    return { opened: true, mode: 'window' };
  }

  /**
   * 使用 macOS 系统默认图片应用打开预览。
   * @param request - 图片预览请求
   * @returns 图片预览结果
   */
  async function previewOnMac(request: ElectronImagePreviewRequest): Promise<ElectronImagePreviewResult> {
    const previewPath = await resolveMacPreviewPath(request).catch(() => null);
    if (!previewPath) {
      return previewInWindow(request);
    }

    const openError = await deps.openPath(previewPath);
    if (openError) {
      throw new Error(openError);
    }

    return { opened: true, mode: 'native' };
  }

  return {
    async previewImage(request: ElectronImagePreviewRequest): Promise<ElectronImagePreviewResult> {
      if (!request.src.trim()) {
        return { opened: false, mode: 'unsupported' };
      }

      if (deps.platform === 'darwin') {
        return previewOnMac(request);
      }

      return previewInWindow(request);
    }
  };
}

/** 默认 Electron 图片预览服务实例。 */
let defaultImagePreviewService: ImagePreviewService | null = null;

/**
 * 获取默认 Electron 图片预览服务。
 * @returns 图片预览服务
 */
export function getImagePreviewService(): ImagePreviewService {
  if (!defaultImagePreviewService) {
    defaultImagePreviewService = createImagePreviewService({
      platform: process.platform,
      tempDir: app.getPath('temp'),
      mkdir,
      readdir,
      stat,
      unlink,
      now: () => Date.now(),
      writeFile,
      fetchRemoteImage: fetchRemoteImageWithLimits,
      openPath: shell.openPath,
      createWindow: (options: Electron.BrowserWindowConstructorOptions): ImagePreviewWindow => new BrowserWindow(options)
    });
  }

  return defaultImagePreviewService;
}
