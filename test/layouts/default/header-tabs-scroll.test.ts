/**
 * @file header-tabs-scroll.test.ts
 * @description HeaderTabs 横向滚动位移计算测试，覆盖 mac 触控板多轴滚动输入。
 */
import { describe, expect, it } from 'vitest';
import { getHeaderTabsWheelScrollDelta } from '@/layouts/default/utils/headerTabsScroll';

describe('getHeaderTabsWheelScrollDelta', (): void => {
  it('lets mac trackpad wheel events use native browser scrolling', (): void => {
    const delta = getHeaderTabsWheelScrollDelta({
      deltaX: 64,
      deltaY: 0,
      deltaMode: 0,
      isMacPlatform: true
    });

    expect(delta).toBeNull();
  });

  it('keeps mac diagonal trackpad wheel events on the native scrolling path', (): void => {
    const delta = getHeaderTabsWheelScrollDelta({
      deltaX: 24,
      deltaY: 80,
      deltaMode: 0,
      isMacPlatform: true
    });

    expect(delta).toBeNull();
  });

  it('does not synthesize manual horizontal scrolling from vertical deltas on mac', (): void => {
    const delta = getHeaderTabsWheelScrollDelta({
      deltaX: 0,
      deltaY: 120,
      deltaMode: 0,
      isMacPlatform: true
    });

    expect(delta).toBeNull();
  });

  it('uses the dominant wheel axis on non-mac platforms', (): void => {
    const delta = getHeaderTabsWheelScrollDelta({
      deltaX: 24,
      deltaY: 80,
      deltaMode: 0,
      isMacPlatform: false
    });

    expect(delta).toBe(80);
  });

  it('maps a traditional vertical mouse wheel to horizontal tab scrolling', (): void => {
    const delta = getHeaderTabsWheelScrollDelta({
      deltaX: 0,
      deltaY: 120,
      deltaMode: 0,
      isMacPlatform: false
    });

    expect(delta).toBe(120);
  });

  it('normalizes line based wheel events before scrolling', (): void => {
    const delta = getHeaderTabsWheelScrollDelta({
      deltaX: 0,
      deltaY: 3,
      deltaMode: 1,
      isMacPlatform: false
    });

    expect(delta).toBe(48);
  });
});
