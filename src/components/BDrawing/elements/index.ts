/**
 * @file index.ts
 * @description BDrawing 元素注册入口。
 */
import type { DrawingElementSchema } from './types';
import type { Component } from 'vue';
import RectView from './Rect/index.vue';
import { rectElementSchema } from './Rect/schema';
import TextView from './Text/index.vue';
import { textElementSchema } from './Text/schema';

/**
 * BDrawing 侧边栏可创建元素注册表。
 */
export const DRAWING_ELEMENT_SCHEMAS: DrawingElementSchema[] = [rectElementSchema, textElementSchema];

/** 元素配置索引。 */
const drawingElementSchemaByName = new Map<string, DrawingElementSchema>(
  DRAWING_ELEMENT_SCHEMAS.map((schema: DrawingElementSchema): [string, DrawingElementSchema] => [schema.name, schema])
);

/** 元素中间画布视图索引。 */
const drawingElementViewByName = new Map<string, Component>([
  [rectElementSchema.name, RectView],
  [textElementSchema.name, TextView]
]);

/**
 * 根据注册名称读取元素展示配置。
 * @param name - 元素注册名称
 * @returns 元素展示配置
 */
export function getDrawingElementSchema(name: string): DrawingElementSchema | null {
  return drawingElementSchemaByName.get(name) ?? null;
}

/**
 * 根据注册名称读取元素中间画布视图。
 * @param name - 元素注册名称
 * @returns 元素中间画布视图组件
 */
export function getDrawingElementView(name: string): Component | null {
  return drawingElementViewByName.get(name) ?? null;
}

export type { DrawingElementRenderSizeConfig, DrawingElementRenderSizeSource, DrawingElementSchema } from './types';
