/**
 * @file types.ts
 * @description BPanelSplitter 组件类型定义
 */

/**
 * 面板宽度约束值，数字表示 px，百分数字符串表示相对父容器宽度。
 */
export type BPanelSplitterSize = number | `${number}%`;

/**
 * BPanelSplitter 组件属性。
 */
export interface BPanelSplitterProps {
  /** 拖拽条所在位置。 */
  position?: 'left' | 'right';
  /** 最小宽度。 */
  minWidth?: BPanelSplitterSize;
  /** 最大宽度。 */
  maxWidth?: BPanelSplitterSize;
  /** 内容区的额外 CSS 类名。 */
  sectionClass?: string;
  /** 过拖触发关闭的阈值，单位 px；当面板在 minWidth 处继续往缩小方向拖拽超过此距离时触发 close 事件。 */
  closeThreshold?: number;
  /** 是否允许拖拽关闭面板，默认 true。 */
  closable?: boolean;
  /** 是否禁用拖拽调整宽度，禁用时隐藏拖拽条。 */
  disabled?: boolean;
}
