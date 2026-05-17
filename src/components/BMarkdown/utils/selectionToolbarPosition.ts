/**
 * @file selectionToolbarPosition.ts
 * @description 统一处理选区工具栏的容器收敛与水平居中定位。
 */

import type { SelectionAssistantPosition, SelectionAssistantRect } from '../adapters/selectionAssistant';

/**
 * 按锚点中心计算水平位置，并限制在容器安全边距内。
 * @param anchorRect - 锚点矩形
 * @param containerRect - 工具栏允许活动的容器矩形
 * @param toolbarWidth - 工具栏宽度
 * @param padding - 容器左右安全边距
 * @returns 最终 left 像素值
 */
export function resolveToolbarLeft(anchorRect: SelectionAssistantRect, containerRect: SelectionAssistantRect, toolbarWidth: number, padding: number): number {
  const anchorCenterX = anchorRect.left + anchorRect.width / 2;
  const minLeft = containerRect.left + padding;
  const maxLeft = containerRect.left + containerRect.width - toolbarWidth - padding;
  if (maxLeft < minLeft) {
    return minLeft;
  }
  return Math.min(Math.max(anchorCenterX - toolbarWidth / 2, minLeft), maxLeft);
}

/**
 * 解析 adapter 传入的容器矩形。
 * 若 adapter 未提供，则回退到 overlayRoot 在当前视口中的可见区。
 * @param position - 当前选区定位信息
 * @param overlayRoot - 浮层根容器
 * @returns 基础可见区域矩形
 */
function resolveViewportContainerRect(position: SelectionAssistantPosition, overlayRoot: HTMLElement | null | undefined): SelectionAssistantRect {
  if (position.containerRect) {
    return position.containerRect;
  }

  const overlayRect = overlayRoot?.getBoundingClientRect() ?? new DOMRect();
  const top = Math.max(0, -overlayRect.top);
  const left = Math.max(0, -overlayRect.left);

  return { top, left, width: window.innerWidth - left, height: window.innerHeight - top };
}

/**
 * 将可见区域进一步限制在 overlayRoot 自身边界内。
 * @param containerRect - 基础可见区域
 * @param overlayRoot - 浮层根容器
 * @returns 与 overlayRoot 求交后的矩形
 */
function constrainRectToOverlayRoot(containerRect: SelectionAssistantRect, overlayRoot: HTMLElement | null | undefined): SelectionAssistantRect {
  const overlayWidth = overlayRoot?.clientWidth ?? 0;
  const overlayHeight = overlayRoot?.clientHeight ?? 0;
  if (overlayWidth <= 0 || overlayHeight <= 0) {
    return containerRect;
  }

  const left = Math.max(containerRect.left, 0);
  const top = Math.max(containerRect.top, 0);
  const right = Math.min(containerRect.left + containerRect.width, overlayWidth);
  const bottom = Math.min(containerRect.top + containerRect.height, overlayHeight);

  return {
    top,
    left,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top)
  };
}

/**
 * 在 overlayRoot 坐标系中解析当前可用的容器矩形。
 * 先使用 adapter 传入的可见视口区域，再与 overlayRoot 的真实尺寸求交集，
 * 避免“视口比编辑器更宽”时工具栏被错误地放到编辑器外侧。
 * @param position - 当前选区定位信息
 * @param overlayRoot - 浮层根容器
 * @returns 工具栏可用的最终容器矩形
 */
export function resolveToolbarContainerRect(position: SelectionAssistantPosition, overlayRoot: HTMLElement | null | undefined): SelectionAssistantRect {
  const viewportRect = resolveViewportContainerRect(position, overlayRoot);
  return constrainRectToOverlayRoot(viewportRect, overlayRoot);
}
