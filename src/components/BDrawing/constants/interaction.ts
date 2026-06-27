/**
 * @file interaction.ts
 * @description BDrawing 工具模式、拖拽和选择交互常量。
 */
import type { SnapDirections } from 'moveable';

/**
 * Moveable 控制框与节点边界之间的视觉留白。
 */
export const DRAWING_MOVEABLE_SELECTION_PADDING = {
  bottom: 5,
  left: 5,
  right: 5,
  top: 5
} as const;

/**
 * Moveable 缩放控制点方向，仅保留四个角以避免边中点误触。
 */
export const DRAWING_MOVEABLE_RENDER_DIRECTIONS: readonly string[] = ['nw', 'ne', 'sw', 'se'];

/**
 * Moveable 元素吸附方向，显式包含中心线和中线。
 */
export const DRAWING_MOVEABLE_SNAP_DIRECTIONS: SnapDirections = {
  bottom: true,
  center: true,
  left: true,
  middle: true,
  right: true,
  top: true
};

/**
 * Moveable 吸附距离阈值。
 */
export const DRAWING_MOVEABLE_SNAP_THRESHOLD = 5;

/**
 * Moveable 拖拽和缩放节流值。
 */
export const DRAWING_MOVEABLE_THROTTLE = 0;

/**
 * Selecto 不应该从这些交互目标启动，避免抢占 Moveable 拖拽和缩放。
 */
export const DRAWING_SELECTO_BLOCKED_DRAG_SELECTOR = [
  '.b-drawing-context-menu',
  '.b-drawing-moveable-layer',
  '.moveable-control',
  '.moveable-line',
  '.moveable-area',
  '.moveable-control-box',
  '.moveable-direction',
  '.b-drawing-element.is-selected'
].join(', ');
