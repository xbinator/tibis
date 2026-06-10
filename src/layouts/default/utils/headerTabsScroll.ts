/**
 * @file headerTabsScroll.ts
 * @description 提供顶部标签栏滚轮横向滚动的位移计算工具。
 */

/**
 * 标签栏滚轮事件所需的位移输入。
 */
export interface HeaderTabsWheelDeltaInput {
  /** 横向滚轮位移 */
  deltaX: number;
  /** 纵向滚轮位移 */
  deltaY: number;
  /** WheelEvent deltaMode，用于兼容行/页滚动单位 */
  deltaMode: number;
  /** 当前是否为 macOS 平台 */
  isMacPlatform: boolean;
}

/** DOM_DELTA_LINE 对应的像素换算值。 */
const WHEEL_LINE_HEIGHT_PX = 16;

/** DOM_DELTA_PAGE 对应的像素换算值。 */
const WHEEL_PAGE_HEIGHT_PX = 800;

/**
 * 将不同 deltaMode 的滚轮位移换算成像素级滚动位移。
 * @param delta - 原始滚轮位移
 * @param deltaMode - WheelEvent deltaMode
 * @returns 像素级滚动位移
 */
function normalizeWheelDelta(delta: number, deltaMode: number): number {
  if (deltaMode === 1) {
    return delta * WHEEL_LINE_HEIGHT_PX;
  }

  if (deltaMode === 2) {
    return delta * WHEEL_PAGE_HEIGHT_PX;
  }

  return delta;
}

/**
 * 计算顶部标签栏应应用到 scrollLeft 的滚动位移。
 * @param input - 滚轮事件位移信息
 * @returns 横向滚动位移，返回 null 时交给浏览器原生滚动
 */
export function getHeaderTabsWheelScrollDelta(input: HeaderTabsWheelDeltaInput): number | null {
  const { deltaX, deltaY, deltaMode, isMacPlatform } = input;

  if (isMacPlatform) {
    return null;
  }

  const horizontalDelta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;

  return normalizeWheelDelta(horizontalDelta, deltaMode);
}
