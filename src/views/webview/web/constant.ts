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
  /** 是否默认启用 touch 模拟 */
  touchByDefault: boolean;
}

/**
 * WebView 设备尺寸预设列表。
 */
export const WEBVIEW_DEVICE_PRESETS: WebviewDevicePreset[] = [
  { key: 'iphone-se', label: 'iPhone SE', width: 375, height: 667, touchByDefault: true },
  { key: 'iphone-14', label: 'iPhone 14', width: 390, height: 844, touchByDefault: true },
  { key: 'pixel-7', label: 'Pixel 7', width: 412, height: 915, touchByDefault: true },
  { key: 'ipad-mini', label: 'iPad mini', width: 768, height: 1024, touchByDefault: true },
  { key: 'desktop', label: 'Desktop', width: 1366, height: 768, touchByDefault: false }
];

/**
 * WebView 默认设备尺寸预设。
 */
export const DEFAULT_WEBVIEW_DEVICE_PRESET = WEBVIEW_DEVICE_PRESETS[0];
