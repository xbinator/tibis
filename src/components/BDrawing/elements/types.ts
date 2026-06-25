/**
 * @file types.ts
 * @description BDrawing 元素注册配置类型。
 * BDrawing 元素注册配置，仅描述侧边栏展示元信息。
 */
export interface DrawingElementSchema {
  /** 元素名称 */
  name: string;
  /** 元素显示名称 */
  label: string;
  /** 侧边栏显示图标 */
  icon: string;
}
