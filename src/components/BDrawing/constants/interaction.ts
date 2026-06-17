/**
 * @file interaction.ts
 * @description BDrawing 工具模式、拖拽和选择交互常量。
 */
import type { DrawingShapeType } from '../types';
import type { SnapDirections } from 'moveable';

/**
 * 可创建形状的工具列表。
 */
export const DRAWING_SHAPE_TOOLS: readonly DrawingShapeType[] = ['process', 'rect', 'ellipse', 'diamond', 'text'];

/**
 * 文本工具点击创建的最大拖动距离。
 */
export const DRAWING_TEXT_CREATE_CLICK_TOLERANCE = 4;

/**
 * 文本工具点击已有元素后等待双击优先的延迟。
 */
export const DRAWING_TEXT_ELEMENT_CLICK_CREATE_DELAY = 220;

/**
 * Moveable 控制框与节点边界之间的视觉留白。
 */
export const DRAWING_MOVEABLE_SELECTION_PADDING = {
  bottom: 0,
  left: 0,
  right: 0,
  top: 0
} as const;

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
  '.b-drawing-moveable-layer',
  '.moveable-control',
  '.moveable-line',
  '.moveable-area',
  '.moveable-control-box',
  '.moveable-direction',
  '.b-drawing-connector__endpoint',
  '.b-drawing-connector__endpoints',
  '.b-drawing-element.is-selected',
  '.b-drawing-style-panel'
].join(', ');
