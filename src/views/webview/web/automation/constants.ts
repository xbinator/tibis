/**
 * @file constants.ts
 * @description WebView 自动化读取与操作常量。
 */

/** 页面正文最大字符数。 */
export const WEBVIEW_PAGE_TEXT_LIMIT = 20000;
/** 页面简化 DOM 最大字符数。 */
export const WEBVIEW_PAGE_CONTENT_LIMIT = 24000;
/** 页面标题最大数量。 */
export const WEBVIEW_PAGE_HEADING_LIMIT = 120;
/** 页面链接最大数量。 */
export const WEBVIEW_PAGE_LINK_LIMIT = 100;
/** 页面选中文本最大字符数。 */
export const WEBVIEW_PAGE_SELECTED_TEXT_LIMIT = 4000;
/** 页面读取超时时间。 */
export const WEBVIEW_PAGE_SNAPSHOT_TIMEOUT_MS = 10000;
/** 页面操作超时时间。 */
export const WEBVIEW_PAGE_OPERATION_TIMEOUT_MS = 10000;
/** 页面可操作元素最大数量。 */
export const WEBVIEW_PAGE_ELEMENT_LIMIT = 180;
