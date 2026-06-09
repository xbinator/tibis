/**
 * @file defaults.ts
 * @description BDrawing 默认尺寸和类型配置。
 */

/**
 * 默认节点尺寸。
 */
export const DRAWING_DEFAULT_NODE_SIZE = {
  width: 180,
  height: 72
} as const;

/**
 * 支持的节点类型。
 */
export const DRAWING_NODE_TYPES = ['process', 'decision', 'actor', 'service', 'database', 'text'] as const;

/**
 * 支持的连线类型。
 */
export const DRAWING_EDGE_TYPES = ['arrow'] as const;

/**
 * 节点类型默认文案。
 */
export const DRAWING_NODE_TYPE_TEXT: Record<(typeof DRAWING_NODE_TYPES)[number], string> = {
  actor: '角色',
  database: '数据库',
  decision: '判断节点',
  process: '流程节点',
  service: '服务',
  text: '文本'
};
