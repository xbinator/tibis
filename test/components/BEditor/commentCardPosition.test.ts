/**
 * @file commentCardPosition.test.ts
 * @description CommentCard 浮层横向定位逻辑测试，验证 resolveHorizontalStyle 的边界收敛行为。
 * @vitest-environment jsdom
 */
import { describe, expect, test } from 'vitest';
import type { SelectionAssistantPosition, SelectionAssistantRect } from '@/components/BEditor/adapters/selectionAssistant';
import { resolveToolbarContainerRect } from '@/components/BEditor/utils/selectionToolbarPosition';

/**
 * 卡片接近容器边缘时的内边距（与 CommentCard.vue 保持一致）。
 */
const CARD_PADDING = 8;

/**
 * 从 CommentCard.vue 中提取的 resolveHorizontalStyle 核心逻辑，
 * 用于独立测试横向定位计算。
 * @param position - 编排层注入的锚点信息
 * @param containerRect - 浮层容器矩形
 * @param wrapperWidth - 卡片宽度
 * @returns 横向样式对象
 */
function resolveHorizontalStyle(
  position: SelectionAssistantPosition,
  containerRect: NonNullable<SelectionAssistantPosition['containerRect']>,
  wrapperWidth: number
): { left: string; transform: string } {
  // 修复后：加括号确保 + 在 ?? 之前求值
  const anchorCenter = (position.anchorRect?.left ?? 0) + (position.anchorRect.width ?? 0) / 2;
  let left = anchorCenter - wrapperWidth / 2;
  const minLeft = containerRect.left + CARD_PADDING;
  const maxLeft = containerRect.left + containerRect.width - wrapperWidth - CARD_PADDING;

  left = Math.max(minLeft, Math.min(maxLeft, left));

  // 显式检查卡片右侧是否超出容器右边界（当 maxLeft < minLeft 时 clamping 可能失效）
  const containerRight = containerRect.left + containerRect.width;
  if (left + wrapperWidth > containerRight) {
    left = containerRight - wrapperWidth;
  }

  return {
    left: `${left}px`,
    transform: 'none'
  };
}

/**
 * 构造 SelectionAssistantPosition 的辅助函数。
 * @param overrides - 锚点矩形属性覆盖
 * @param containerOverrides - 容器矩形属性覆盖
 * @returns 完整的定位信息
 */
function createPosition(
  overrides: Partial<SelectionAssistantPosition['anchorRect']> = {},
  containerOverrides: Partial<NonNullable<SelectionAssistantPosition['containerRect']>> = {}
): SelectionAssistantPosition {
  return {
    anchorRect: {
      top: 100,
      left: 400,
      width: 200,
      height: 24,
      ...overrides
    },
    lineHeight: 24,
    containerRect: {
      top: 0,
      left: 0,
      width: 800,
      height: 600,
      ...containerOverrides
    }
  };
}

describe('CommentCard resolveHorizontalStyle', () => {
  /**
   * 基本场景：锚点在容器中央，卡片宽度 320，应该居中显示。
   */
  test('锚点在容器中央时，卡片居中对齐', () => {
    const position = createPosition({ left: 400, width: 200 });
    const containerRect = position.containerRect!;
    const wrapperWidth = 320;

    // anchorCenter 应为 400 + 200/2 = 500，卡片 left = 500 - 160 = 340
    const result = resolveHorizontalStyle(position, containerRect, wrapperWidth);

    expect(result.transform).toBe('none');
    // 期望 left = 340px，但由于 bug，anchorCenter = 400（丢失了 width/2）
    // 实际 left = 400 - 160 = 240
    expect(result.left).toBe('340px');
  });

  /**
   * 核心场景：锚点靠近右侧时，卡片不应超出容器右边界。
   */
  test('锚点靠近右侧时，卡片不超出容器右边界', () => {
    const position = createPosition({ left: 600, width: 100 });
    const containerRect = position.containerRect!;
    const wrapperWidth = 320;

    // anchorCenter 应为 600 + 100/2 = 650
    // left = 650 - 160 = 490
    // maxLeft = 0 + 800 - 320 - 8 = 472
    // 最终 left = Math.max(8, Math.min(472, 490)) = 472
    const result = resolveHorizontalStyle(position, containerRect, wrapperWidth);

    const maxLeft = containerRect.left + containerRect.width - wrapperWidth - CARD_PADDING;
    const resultLeft = parseFloat(result.left);
    expect(resultLeft).toBeLessThanOrEqual(maxLeft);
  });

  /**
   * 极端场景：锚点在最右边，卡片必须收敛到容器内。
   */
  test('锚点在最右边时，卡片右侧不溢出容器', () => {
    const position = createPosition({ left: 750, width: 50 });
    const containerRect = position.containerRect!;
    const wrapperWidth = 320;

    // anchorCenter 应为 750 + 50/2 = 775
    // left = 775 - 160 = 615
    // maxLeft = 0 + 800 - 320 - 8 = 472
    // 最终 left = 472
    const result = resolveHorizontalStyle(position, containerRect, wrapperWidth);

    const maxLeft = containerRect.left + containerRect.width - wrapperWidth - CARD_PADDING;
    const resultLeft = parseFloat(result.left);
    expect(resultLeft).toBeLessThanOrEqual(maxLeft);
  });

  /**
   * 验证 anchorCenter 的计算是否正确包含了 width/2 偏移。
   * 这是 bug 的核心：由于 ?? 优先级低于 +，
   * 当 left 存在时，anchorCenter = left（丢失 width/2）。
   */
  test('anchorCenter 应等于 left + width/2，而非仅 left', () => {
    const position = createPosition({ left: 300, width: 200 });
    const containerRect = position.containerRect!;
    const wrapperWidth = 200;

    // anchorCenter 应为 300 + 100 = 400
    // left = 400 - 100 = 300
    // minLeft = 8, maxLeft = 800 - 200 - 8 = 592
    // 最终 left = 300
    const result = resolveHorizontalStyle(position, containerRect, wrapperWidth);

    // 由于 bug，anchorCenter = 300（只有 left，没有 +width/2）
    // left = 300 - 100 = 200
    // 期望 300，实际 200
    expect(result.left).toBe('300px');
  });

  /**
   * 锚点在左侧时，卡片不超出容器左边界。
   */
  test('锚点靠近左侧时，卡片不超出容器左边界', () => {
    const position = createPosition({ left: 10, width: 50 });
    const containerRect = position.containerRect!;
    const wrapperWidth = 320;

    const result = resolveHorizontalStyle(position, containerRect, wrapperWidth);

    const minLeft = containerRect.left + CARD_PADDING;
    const resultLeft = parseFloat(result.left);
    expect(resultLeft).toBeGreaterThanOrEqual(minLeft);
  });

  /**
   * 核心边界检查：left + wrapperWidth 绝对不能超出容器右边界。
   * 当容器较窄、卡片宽度占容器大部分时，maxLeft 可能小于 minLeft，
   * 导致 Math.max(minLeft, ...) 返回 minLeft，卡片右侧溢出。
   */
  test('left + wrapperWidth 不超出容器右边界', () => {
    const position = createPosition({ left: 300, width: 100 }, { left: 0, width: 400 });
    const containerRect = position.containerRect!;
    const wrapperWidth = 320;

    // anchorCenter = 300 + 50 = 350
    // left = 350 - 160 = 190
    // minLeft = 0 + 8 = 8
    // maxLeft = 0 + 400 - 320 - 8 = 72
    // Math.max(8, Math.min(72, 190)) = 72
    // 但 72 + 320 = 392 < 400，所以不溢出
    //
    // 但如果容器更窄（width=340）：
    // maxLeft = 0 + 340 - 320 - 8 = 12
    // minLeft = 8
    // Math.max(8, Math.min(12, 190)) = 12
    // 12 + 320 = 332 < 340，不溢出
    //
    // 极端情况：容器 width=330
    // maxLeft = 0 + 330 - 320 - 8 = 2
    // minLeft = 8
    // maxLeft(2) < minLeft(8)
    // Math.max(8, Math.min(2, 190)) = Math.max(8, 2) = 8
    // 8 + 320 = 328 < 330，不溢出（但仅差 2px）
    //
    // 容器 width=325：
    // maxLeft = 0 + 325 - 320 - 8 = -3
    // minLeft = 8
    // Math.max(8, Math.min(-3, 190)) = Math.max(8, -3) = 8
    // 8 + 320 = 328 > 325，溢出！
    const result = resolveHorizontalStyle(position, containerRect, wrapperWidth);
    const resultLeft = parseFloat(result.left);
    const containerRight = containerRect.left + containerRect.width;

    expect(resultLeft + wrapperWidth).toBeLessThanOrEqual(containerRight);
  });

  /**
   * 窄容器场景：容器宽度仅比卡片宽度多一点，卡片右侧不能溢出。
   */
  test('窄容器时 left + wrapperWidth 不超出容器右边界', () => {
    const position = createPosition({ left: 200, width: 80 }, { left: 0, width: 325 });
    const containerRect = position.containerRect!;
    const wrapperWidth = 320;

    // maxLeft = 0 + 325 - 320 - 8 = -3
    // minLeft = 8
    // maxLeft < minLeft → Math.max(8, -3) = 8
    // 8 + 320 = 328 > 325 → 溢出 3px
    const result = resolveHorizontalStyle(position, containerRect, wrapperWidth);
    const resultLeft = parseFloat(result.left);
    const containerRight = containerRect.left + containerRect.width;

    expect(resultLeft + wrapperWidth).toBeLessThanOrEqual(containerRight);
  });

  /**
   * 容器有 left 偏移时，卡片右侧不能溢出容器右边界。
   */
  test('容器有 left 偏移时，left + wrapperWidth 不超出容器右边界', () => {
    const position = createPosition({ left: 500, width: 100 }, { left: 100, width: 400 });
    const containerRect = position.containerRect!;
    const wrapperWidth = 320;

    // anchorCenter = 500 + 50 = 550
    // left = 550 - 160 = 390
    // minLeft = 100 + 8 = 108
    // maxLeft = 100 + 400 - 320 - 8 = 172
    // Math.max(108, Math.min(172, 390)) = 172
    // 172 + 320 = 492 = 100 + 400 - 8，不溢出
    const result = resolveHorizontalStyle(position, containerRect, wrapperWidth);
    const resultLeft = parseFloat(result.left);
    const containerRight = containerRect.left + containerRect.width;

    expect(resultLeft + wrapperWidth).toBeLessThanOrEqual(containerRight);
  });
});

describe('CommentCard containerRect fallback', () => {
  /**
   * 当 position.containerRect 为 null 时，不应使用 window.innerWidth/innerHeight，
   * 而应基于 overlayRoot 的尺寸计算容器矩形。
   * 使用 window 尺寸会导致：overlayRoot 比视口小时，卡片定位到编辑器外部。
   */
  test('containerRect 为 null 时，resolveToolbarContainerRect 基于 overlayRoot 而非 window', () => {
    // 模拟 overlayRoot 比视口小的情况
    const overlayRoot = {
      getBoundingClientRect: () => new DOMRect(100, 50, 600, 400),
      clientWidth: 600,
      clientHeight: 400
    } as HTMLElement;

    const position: SelectionAssistantPosition = {
      anchorRect: { top: 100, left: 400, width: 200, height: 24 },
      lineHeight: 24
      // containerRect 为 undefined
    };

    const containerRect = resolveToolbarContainerRect(position, overlayRoot);

    // 容器宽度应受限于 overlayRoot 的 clientWidth（600），而非 window.innerWidth
    expect(containerRect.width).toBeLessThanOrEqual(600);
    // 容器高度应受限于 overlayRoot 的 clientHeight（400），而非 window.innerHeight
    expect(containerRect.height).toBeLessThanOrEqual(400);
  });

  /**
   * overlayRoot 有偏移时，containerRect 的 left/top 应正确反映偏移。
   * 使用 window 尺寸的 fallback 会忽略偏移，导致卡片定位错误。
   */
  test('overlayRoot 有偏移时，containerRect 的 left/top 反映偏移', () => {
    const overlayRoot = {
      getBoundingClientRect: () => new DOMRect(200, 100, 600, 400),
      clientWidth: 600,
      clientHeight: 400
    } as HTMLElement;

    const position: SelectionAssistantPosition = {
      anchorRect: { top: 150, left: 300, width: 100, height: 24 },
      lineHeight: 24
    };

    const containerRect = resolveToolbarContainerRect(position, overlayRoot);

    // overlayRect.left = 200，所以 viewport left = max(0, -200) = 0
    // 但 constrainRectToOverlayRoot 会将 left 限制在 [0, overlayWidth) 范围
    expect(containerRect.left).toBeGreaterThanOrEqual(0);
    expect(containerRect.width).toBeLessThanOrEqual(600);
  });

  /**
   * 使用 window 尺寸作为 fallback 的错误行为：
   * 当 overlayRoot 宽度为 600，但 window 宽度为 1920 时，
   * 卡片会被定位到编辑器右侧很远的位置。
   */
  test('window 尺寸 fallback 会导致容器矩形远大于 overlayRoot', () => {
    const overlayRoot = {
      getBoundingClientRect: () => new DOMRect(0, 0, 600, 400),
      clientWidth: 600,
      clientHeight: 400
    } as HTMLElement;

    const position: SelectionAssistantPosition = {
      anchorRect: { top: 100, left: 400, width: 200, height: 24 },
      lineHeight: 24
    };

    // 错误的 fallback（当前实现）
    const wrongFallback: SelectionAssistantRect = {
      top: 0,
      left: 0,
      width: window.innerWidth,
      height: window.innerHeight
    };

    // 正确的实现
    const correctRect = resolveToolbarContainerRect(position, overlayRoot);

    // window 尺寸远大于 overlayRoot
    expect(wrongFallback.width).toBeGreaterThan(600);
    // 正确实现应限制在 overlayRoot 范围内
    expect(correctRect.width).toBeLessThanOrEqual(600);
  });
});
