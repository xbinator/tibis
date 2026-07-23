/**
 * @file link.ts
 * @description 收口 Markdown/富文本链接在应用内与系统外部的导航行为。
 */
import type { LinkNavigationActions } from '../types';
import { useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import { native } from '@/shared/platform';

/**
 * 允许在应用内 WebView 中打开的 URL 协议。
 */
const WEBVIEW_SCHEMES = ['http:', 'https:'];

/**
 * 交给系统默认程序打开的 URL 协议。
 */
const EXTERNAL_SCHEMES = ['mailto:', 'ftp:'];

/**
 * 判断 URL 协议是否应该在应用内 WebView 打开。
 * @param protocol - URL 协议
 * @returns 是否为应用内 WebView 支持协议
 */
function isWebviewScheme(protocol: string): boolean {
  return WEBVIEW_SCHEMES.includes(protocol);
}

/**
 * 判断 URL 协议是否应该交给系统默认程序打开。
 * @param protocol - URL 协议
 * @returns 是否为系统外部打开协议
 */
function isExternalScheme(protocol: string): boolean {
  return EXTERNAL_SCHEMES.includes(protocol);
}

/**
 * 解析绝对 URL。
 * 相对路径、锚点、非标准链接会返回 null，交给浏览器默认行为处理。
 * @param rawHref - 链接原始 href
 * @returns 绝对 URL；无法解析时返回 null
 */
function parseAbsoluteUrl(rawHref: string): URL | null {
  try {
    return new URL(rawHref);
  } catch {
    return null;
  }
}

/**
 * 创建链接导航能力。
 * @returns 链接导航动作
 */
export function useLinkNavigation(): LinkNavigationActions {
  const router = useRouter();

  /**
   * 使用应用内 WebView 打开 URL。
   * @param url - 目标 URL
   */
  function openWebview(url: URL): void {
    router.push({ name: 'webview-web', query: { url: encodeURIComponent(url.href) } });
  }

  /**
   * 使用系统默认程序打开 URL。
   * @param url - 目标 URL
   */
  function openExternal(url: URL): void {
    native.openExternal(url.href);
  }

  /**
   * 统一处理 Markdown/富文本渲染内容中的链接点击事件。
   *
   * - http/https 链接：应用内 WebView 打开
   * - mailto/ftp 链接：系统默认程序打开
   * - 锚点/相对路径：保留默认行为
   * - 其他协议：阻止默认行为，避免 javascript: 等危险协议执行
   *
   * @param event - 鼠标点击事件
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
      openWebview(url);
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

  return { onLink, openWebview, openExternal };
}
