/**
 * @file use-tab-dragger.test.ts
 * @description HeaderTabs 拖拽指引条位置计算测试，覆盖首尾边界与 sticky target 的优先级。
 */
import { describe, expect, it } from 'vitest';
import { resolveDragIndicatorPlacement } from '@/layouts/default/hooks/useTabDragger';

describe('resolveDragIndicatorPlacement', (): void => {
  const tabRects = [
    { id: 'tab-1', left: 16, width: 80 },
    { id: 'tab-2', left: 100, width: 80 },
    { id: 'tab-3', left: 184, width: 80 }
  ];

  it('prefers the first-tab before indicator when the pointer is left of all tabs despite a sticky target', (): void => {
    const placement = resolveDragIndicatorPlacement({
      pointerX: 8,
      sourceTabId: 'tab-3',
      targetTabId: 'tab-2',
      targetEdge: 'right',
      tabs: tabRects
    });

    expect(placement).toEqual({
      tabId: 'tab-1',
      position: 'before',
      offset: 16
    });
  });

  it('prefers the last-tab after indicator when the pointer is right of all tabs despite a sticky target', (): void => {
    const placement = resolveDragIndicatorPlacement({
      pointerX: 280,
      sourceTabId: 'tab-1',
      targetTabId: 'tab-2',
      targetEdge: 'left',
      tabs: tabRects
    });

    expect(placement).toEqual({
      tabId: 'tab-3',
      position: 'after',
      offset: 264
    });
  });

  it('uses the hitbox edge while the pointer remains inside the tab strip', (): void => {
    const placement = resolveDragIndicatorPlacement({
      pointerX: 120,
      sourceTabId: 'tab-1',
      targetTabId: 'tab-2',
      targetEdge: 'left',
      tabs: tabRects
    });

    expect(placement).toEqual({
      tabId: 'tab-2',
      position: 'before',
      offset: 100
    });
  });
});
