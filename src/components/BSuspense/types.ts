/**
 * @file types.ts
 * @description BSuspense 元件类型定义
 */

/**
 * BSuspense 元件入参
 */
export interface BSuspenseProps {
  /** 是否挂载默认插槽内容；false 时仅占位，不渲染 default slot */
  active?: boolean;
}
