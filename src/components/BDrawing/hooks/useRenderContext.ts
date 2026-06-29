/**
 * @file useRenderContext.ts
 * @description BDrawing 画布渲染上下文 provide/inject hook。
 */
import type { DrawingRenderContext } from '../types';
import { inject, provide, ref } from 'vue';
import type { InjectionKey, Ref } from 'vue';

/** 画布渲染上下文注入键。 */
const DRAWING_RENDER_CONTEXT_KEY: InjectionKey<Readonly<Ref<DrawingRenderContext | undefined>>> = Symbol('BDrawingRenderContext');
/** 未处于画布 provider 下时使用的空渲染上下文。 */
const EMPTY_RENDER_CONTEXT = ref<DrawingRenderContext | undefined>();

/**
 * 向下提供画布渲染上下文。
 * @param renderContext - 响应式画布渲染上下文
 */
export function provideRenderContext(renderContext: Readonly<Ref<DrawingRenderContext | undefined>>): void {
  provide(DRAWING_RENDER_CONTEXT_KEY, renderContext);
}

/**
 * 注入最近的画布渲染上下文。
 * @returns 响应式画布渲染上下文
 */
export function useRenderContext(): Readonly<Ref<DrawingRenderContext | undefined>> {
  return inject(DRAWING_RENDER_CONTEXT_KEY, EMPTY_RENDER_CONTEXT);
}
