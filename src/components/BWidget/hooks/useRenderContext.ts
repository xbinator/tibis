/**
 * @file useRenderContext.ts
 * @description BWidget Widget渲染上下文 provide/inject hook。
 */
import type { WidgetRenderContext } from 'types/widget';
import { inject, provide, ref } from 'vue';
import type { InjectionKey, Ref } from 'vue';

/** Widget渲染上下文注入键。 */
const WIDGET_RENDER_CONTEXT_KEY: InjectionKey<Readonly<Ref<WidgetRenderContext | undefined>>> = Symbol('BWidgetRenderContext');
/** 未处于Widget provider 下时使用的空渲染上下文。 */
const EMPTY_RENDER_CONTEXT = ref<WidgetRenderContext | undefined>();

/**
 * 向下提供Widget渲染上下文。
 * @param renderContext - 响应式Widget渲染上下文
 */
export function provideRenderContext(renderContext: Readonly<Ref<WidgetRenderContext | undefined>>): void {
  provide(WIDGET_RENDER_CONTEXT_KEY, renderContext);
}

/**
 * 注入最近的Widget渲染上下文。
 * @returns 响应式Widget渲染上下文
 */
export function useRenderContext(): Readonly<Ref<WidgetRenderContext | undefined>> {
  return inject(WIDGET_RENDER_CONTEXT_KEY, EMPTY_RENDER_CONTEXT);
}
