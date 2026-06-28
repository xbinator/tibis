import type { CSSProperties } from 'vue';

/**
 * 抽屉位置
 */
export type BDrawerPlacement = 'left' | 'right' | 'top' | 'bottom';

/**
 * 抽屉渲染容器类型
 * - string：CSS 选择器
 * - HTMLElement：DOM 节点
 * - function：返回 DOM 节点的函数
 * - false：渲染在当前 DOM 位置
 * - undefined：使用默认容器（布局的主内容区 `.b-layout__content__main`）
 */
export type BDrawerContainer = string | HTMLElement | (() => HTMLElement) | false | undefined;

/**
 * BDrawer 抽屉组件 Props
 */
export interface BDrawerProps {
  /** 是否打开（支持 v-model:open） */
  open?: boolean;
  /** 抽屉标题，支持同名 slot 覆盖 */
  title?: string;
  /** 宽度，仅在 placement 为 left/right 时生效 */
  width?: string | number;
  /** 高度，仅在 placement 为 top/bottom 时生效 */
  height?: string | number;
  /** 抽屉位置，默认右侧 */
  placement?: BDrawerPlacement;
  /** 是否显示右上角关闭按钮 */
  closable?: boolean;
  /** 是否显示遮罩层 */
  mask?: boolean;
  /** 点击遮罩是否可关闭 */
  maskClosable?: boolean;
  /** 是否支持键盘 ESC 关闭 */
  keyboard?: boolean;
  /**
   * 抽屉渲染容器
   * 不传时默认使用布局注入的 `.b-layout__content__main` 容器
   */
  getContainer?: BDrawerContainer;
  /** 主体内容区额外类名 */
  mainClass?: string;
  /** 主体内容区额外样式 */
  mainStyle?: CSSProperties | string;
  /** 关闭回调，触发时机早于 afterClose */
  close?: () => void;
  /** 抽屉完全关闭后的回调 */
  afterClose?: () => void;
  /** 抽屉层级 */
  zIndex?: number;
}

/**
 * 默认抽屉容器选择器
 * 对应 `src/layouts/default/index.vue` 中的 `.b-layout__content__main` 节点，
 * BDrawer 未显式传入 `getContainer` 时会渲染到该节点，避免遮挡 header 与右侧 ChatSider。
 */
export const DEFAULT_DRAWER_CONTAINER = '.b-layout__content';
