/**
 * @file context.ts
 * @description BSection 区块组件与字段行组件的共享上下文。
 */
import { inject, provide, ref } from 'vue';
import type { InjectionKey, Ref } from 'vue';

/**
 * BSection 前缀最小宽度配置值。
 */
export type BSectionLabelMinWidth = number | string;

/**
 * BSection 标签最小宽度响应式引用。
 */
export type BSectionLabelMinWidthRef = Readonly<Ref<BSectionLabelMinWidth | undefined>>;

/**
 * BSection 共享上下文。
 */
export interface BSectionContext {
  /** 字段行标签最小宽度。 */
  labelMinWidth: BSectionLabelMinWidthRef;
}

/** BSection 共享上下文注入键。 */
const B_SECTION_CONTEXT_KEY: InjectionKey<BSectionContext> = Symbol('BSectionContext');

/** 未处于 BSectionBlock 下时使用的空标签宽度配置。 */
const EMPTY_LABEL_MIN_WIDTH = ref<BSectionLabelMinWidth | undefined>();

/** 未处于 BSectionBlock 下时使用的空上下文。 */
const EMPTY_SECTION_CONTEXT: BSectionContext = {
  labelMinWidth: EMPTY_LABEL_MIN_WIDTH
};

/**
 * 向下提供 BSection 共享上下文。
 * @param context - BSection 共享上下文。
 */
export function provideSectionContext(context: BSectionContext): void {
  provide(B_SECTION_CONTEXT_KEY, context);
}

/**
 * 注入最近的 BSection 共享上下文。
 * @returns BSection 共享上下文。
 */
export function useSectionContext(): BSectionContext {
  return inject(B_SECTION_CONTEXT_KEY, EMPTY_SECTION_CONTEXT);
}
