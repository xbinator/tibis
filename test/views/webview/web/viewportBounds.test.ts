/**
 * @file viewportBounds.test.ts
 * @description 验证 WebView 设备视口可见宿主层范围计算。
 */

import { describe, expect, it } from 'vitest';
import { resolveVisibleWebviewBounds, type ViewportRectLike } from '@/views/webview/web/utils/viewportBounds';

/**
 * 创建测试矩形。
 * @param left - 左侧坐标
 * @param top - 顶部坐标
 * @param width - 宽度
 * @param height - 高度
 * @returns 测试矩形
 */
function rect(left: number, top: number, width: number, height: number): ViewportRectLike {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height
  };
}

describe('resolveVisibleWebviewBounds', () => {
  it('clips an oversized device viewport to the scroll frame', () => {
    const result = resolveVisibleWebviewBounds(rect(100, 80, 390, 844), rect(0, 120, 800, 500));

    expect(result).toEqual({
      x: 100,
      y: 120,
      width: 390,
      height: 500,
      contentWidth: 390,
      contentHeight: 844,
      offsetX: 0,
      offsetY: 40
    });
  });

  it('returns null when the device viewport is outside the scroll frame', () => {
    expect(resolveVisibleWebviewBounds(rect(100, 700, 390, 844), rect(0, 0, 800, 500))).toBeNull();
  });
});
