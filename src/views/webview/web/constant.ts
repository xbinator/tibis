/**
 * @file constant.ts
 * @description WebView 页面常量定义。
 */

/**
 * WebView 设备预设标识。
 */
export type WebviewDevicePresetKey = 'iphone-se' | 'iphone-14' | 'pixel-7' | 'ipad-mini' | 'desktop';

/**
 * WebView 设备尺寸预设。
 */
export interface WebviewDevicePreset {
  /** 预设标识 */
  key: WebviewDevicePresetKey;
  /** 展示名称 */
  label: string;
  /** 设备视口宽度 */
  width: number;
  /** 设备视口高度 */
  height: number;
  /** 设备 User-Agent */
  userAgent: string;
  /** 是否默认启用 touch 模拟 */
  touchByDefault: boolean;
}

/**
 * WebView 设备尺寸预设列表。
 */
export const WEBVIEW_DEVICE_PRESETS: WebviewDevicePreset[] = [
  {
    key: 'iphone-se',
    label: 'iPhone SE',
    width: 375,
    height: 667,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    touchByDefault: true
  },
  {
    key: 'iphone-14',
    label: 'iPhone 14',
    width: 390,
    height: 844,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    touchByDefault: true
  },
  {
    key: 'pixel-7',
    label: 'Pixel 7',
    width: 412,
    height: 915,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
    touchByDefault: true
  },
  {
    key: 'ipad-mini',
    label: 'iPad mini',
    width: 768,
    height: 1024,
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    touchByDefault: true
  },
  {
    key: 'desktop',
    label: 'Desktop',
    width: 1366,
    height: 768,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    touchByDefault: false
  }
];

/**
 * WebView 默认设备尺寸预设。
 */
export const DEFAULT_WEBVIEW_DEVICE_PRESET = WEBVIEW_DEVICE_PRESETS[0];
