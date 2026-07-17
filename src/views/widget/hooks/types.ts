/**
 * @file types.ts
 * @description Widget页面 hooks 共享类型。
 */
import type { Ref } from 'vue';
import type BWidgetComponent from '@/components/BWidget/index.vue';
import type { BWidgetExpose, WidgetData } from '@/components/BWidget/types';

/**
 * Widget 子 Hook 所需的最小数据会话。
 */
export interface WidgetDataSession {
  /** 当前 Widget 数据 */
  data: Ref<WidgetData>;
}

/**
 * Widget组件模板引用实例类型。
 */
export type WidgetComponentRef = InstanceType<typeof BWidgetComponent> & BWidgetExpose;
