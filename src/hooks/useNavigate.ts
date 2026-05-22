/**
 * @file useNavigate.ts
 * @description Markdown/富文本链接点击与文件打开统一导航逻辑。
 */
import { useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import { customAlphabet } from 'nanoid';
import { useOpenFile } from '@/hooks/useOpenFile';
import { native } from '@/shared/platform/native';
import { useFileSelectionIntentStore } from '@/stores/editor/fileSelectionIntent';

/**
 * 允许在应用内 webview 中打开的 URL 协议。
 */
const WEBVIEW_SCHEMES = ['http:', 'https:'];

/**
 * 交给系统默认程序打开的 URL 协议。
 */
const EXTERNAL_SCHEMES = ['mailto:', 'ftp:'];

/**
 * 生成一次性文件选区意图 ID。
 */
const createIntentId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz_', 8);

/**
 * 文件选区范围。
 */
export interface FileSelectionRange {
  /** 起始行号（1-based），0 表示无行号 */
  startLine: number;
  /** 结束行号（1-based），0 表示无行号 */
  endLine: number;
}

/**
 * 打开文件参数。
 */
export interface OpenFileOptions {
  /** 文件绝对路径；已保存文件优先使用 */
  filePath?: string | null;
  /** 文件 ID；未保存草稿或已知文件记录时使用 */
  fileId?: string | null;
  /** 展示用文件名 */
  fileName?: string;
  /** 打开后可选定位到的源码行范围 */
  range?: FileSelectionRange;
}

/**
 * 创建统一的链接点击与文件打开导航逻辑。
 */
export function useNavigate() {
  const router = useRouter();
  const openFileActions = useOpenFile();
  const fileSelectionIntentStore = useFileSelectionIntentStore();

  let isNavigating = false;

  /**
   * 判断 URL 协议是否应该在应用内 webview 打开。
   */
  function isWebviewScheme(protocol: string): boolean {
    return WEBVIEW_SCHEMES.includes(protocol);
  }

  /**
   * 判断 URL 协议是否应该交给系统默认程序打开。
   */
  function isExternalScheme(protocol: string): boolean {
    return EXTERNAL_SCHEMES.includes(protocol);
  }

  /**
   * 解析绝对 URL。
   * 相对路径、锚点、非标准链接会返回 null，交给浏览器默认行为处理。
   */
  function parseAbsoluteUrl(rawHref: string): URL | null {
    try {
      return new URL(rawHref);
    } catch {
      return null;
    }
  }

  /**
   * 使用应用内 webview 打开 URL。
   */
  function openInWebview(url: URL): void {
    router.push({ name: 'webview-web', query: { url: encodeURIComponent(url.href) } });
  }

  /**
   * 使用系统默认程序打开 URL。
   */
  function openExternal(url: URL): void {
    native.openExternal(url.href);
  }

  /**
   * 统一处理 Markdown/富文本渲染内容中的链接点击事件。
   *
   * - http/https 链接 → 应用内 webview 打开
   * - mailto/ftp 链接 → 系统默认程序打开
   * - 锚点/相对路径 → 不做处理，保留默认行为
   * - 其他协议 → 阻止默认行为，避免 javascript: 等危险协议执行
   */
  function onLink(event: MouseEvent): void {
    const { target } = event;

    if (!(target instanceof Element)) {
      return;
    }

    const anchor = target.closest('a[href]');

    if (!(anchor instanceof HTMLAnchorElement)) {
      return;
    }

    const rawHref = anchor.getAttribute('href');

    if (!rawHref) {
      return;
    }

    const url = parseAbsoluteUrl(rawHref);

    if (!url) {
      return;
    }

    if (isWebviewScheme(url.protocol)) {
      event.preventDefault();
      openInWebview(url);
      return;
    }

    if (isExternalScheme(url.protocol)) {
      event.preventDefault();
      openExternal(url);
      return;
    }

    event.preventDefault();
    message.warning('不支持的链接协议');
  }

  /**
   * 规范化待写入的文件选区范围。
   */
  function normalizeRange(range: FileSelectionRange): FileSelectionRange {
    const startLine = Math.max(1, range.startLine);
    const endLine = Math.max(startLine, range.endLine);

    return {
      startLine,
      endLine
    };
  }

  /**
   * 根据打开参数解析并打开文件。
   */
  async function resolveOpenedFile(options: OpenFileOptions) {
    if (options.filePath) {
      return openFileActions.openFileByPath(options.filePath);
    }

    if (options.fileId) {
      return openFileActions.openFileById(options.fileId);
    }

    return null;
  }

  /**
   * 写入一次性文件选区意图。
   */
  function setFileSelectionIntent(fileId: string, range: FileSelectionRange): void {
    const normalizedRange = normalizeRange(range);

    fileSelectionIntentStore.setIntent({
      intentId: createIntentId(),
      fileId,
      startLine: normalizedRange.startLine,
      endLine: normalizedRange.endLine
    });
  }

  /**
   * 根据路径或文件 ID 打开文件，并在需要时写入一次性选区意图。
   */
  async function openFile(options: OpenFileOptions): Promise<void> {
    if (isNavigating) {
      return;
    }

    isNavigating = true;

    try {
      const openedFile = await resolveOpenedFile(options);

      if (!openedFile) {
        message.error(options.fileId ? '未找到引用草稿' : '未找到引用文件');
        return;
      }

      // 无行号时（startLine === 0 && endLine === 0）不设置选区意图
      if (!options.range || (options.range.startLine === 0 && options.range.endLine === 0)) {
        return;
      }

      setFileSelectionIntent(openedFile.id, options.range);
    } finally {
      isNavigating = false;
    }
  }

  return {
    onLink,
    openFile
  };
}
