/**
 * @file useWidgetContext.ts
 * @description BWidget 通用上下文 provide/inject hook。
 */
import type { WidgetData } from '../types';
import { inject, provide, ref } from 'vue';
import type { InjectionKey, Ref } from 'vue';

/**
 * BWidget 通用上下文。
 */
export interface WidgetContext {
  /** 当前 Widget 完整数据 */
  widgetData: Readonly<Ref<WidgetData | undefined>>;
  /** 当前选中的元素 ID 列表 */
  selectedElementIds: Readonly<Ref<string[]>>;
}

/** BWidget 通用上下文注入键。 */
const WIDGET_CONTEXT_KEY: InjectionKey<WidgetContext> = Symbol('BWidgetContext');
/** 未处于Widget provider 下时使用的空 Widget 数据。 */
const EMPTY_WIDGET_DATA = ref<WidgetData | undefined>();
/** 未处于Widget provider 下时使用的空选区。 */
const EMPTY_SELECTED_ELEMENT_IDS = ref<string[]>([]);
/** 未处于Widget provider 下时使用的空上下文。 */
const EMPTY_WIDGET_CONTEXT: WidgetContext = {
  widgetData: EMPTY_WIDGET_DATA,
  selectedElementIds: EMPTY_SELECTED_ELEMENT_IDS
};

/**
 * 向下提供 BWidget 通用上下文。
 * @param context - 响应式 Widget 上下文
 */
export function provideWidgetContext(context: WidgetContext): void {
  provide(WIDGET_CONTEXT_KEY, context);
}

/**
 * 注入最近的 BWidget 通用上下文。
 * @returns 响应式 Widget 上下文
 */
export function useWidgetContext(): WidgetContext {
  return inject(WIDGET_CONTEXT_KEY, EMPTY_WIDGET_CONTEXT);
}
