/**
 * @file types.ts
 * @description Widget页面 hooks 共享类型。
 */
import type BWidgetComponent from '@/components/BWidget/index.vue';
import type { BWidgetExpose } from '@/components/BWidget/types';

/**
 * Widget组件模板引用实例类型。
 */
export type WidgetComponentRef = InstanceType<typeof BWidgetComponent> & BWidgetExpose;
