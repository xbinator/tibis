/**
 * @file useRenderContext.ts
 * @description BWidget Widget渲染上下文 provide/inject hook。
 */
import type { WidgetRenderContextOptions } from '../types';
import type { WidgetRenderContext } from 'types/widget';
import { computed, inject, provide, ref } from 'vue';
import type { InjectionKey, Ref } from 'vue';

export type { WidgetRenderContextOptions, WidgetRenderMode } from '../types';

/**
 * Widget Vue 渲染上下文状态。
 */
export interface WidgetRenderContextState {
  /** Widget 渲染上下文 */
  renderContext: Readonly<Ref<WidgetRenderContext | undefined>>;
  /** Widget 渲染选项 */
  options: Readonly<Ref<WidgetRenderContextOptions>>;
}

/** Widget渲染 provider 注入键。 */
const WIDGET_RENDER_CONTEXT_KEY: InjectionKey<WidgetRenderContextState> = Symbol('BWidgetRenderContext');
/** 未处于Widget provider 下时使用的空渲染上下文。 */
const EMPTY_RENDER_CONTEXT = ref<WidgetRenderContext | undefined>();
/** 未处于Widget provider 下时使用的默认渲染选项。 */
const DEFAULT_RENDER_CONTEXT_OPTIONS = ref<WidgetRenderContextOptions>({ mode: 'design' });
/** 未处于Widget provider 下时使用的默认 provider 值。 */
const DEFAULT_RENDER_PROVIDER: WidgetRenderContextState = {
  renderContext: EMPTY_RENDER_CONTEXT,
  options: DEFAULT_RENDER_CONTEXT_OPTIONS
};

/**
 * 向下提供Widget渲染上下文。
 * @param renderContext - 响应式Widget渲染上下文
 * @param options - 当前 Vue 渲染选项；不传字段时继承上级选项
 */
export function provideRenderContext(renderContext: Readonly<Ref<WidgetRenderContext | undefined>>, options: WidgetRenderContextOptions = {}): void {
  const parentProvider = inject(WIDGET_RENDER_CONTEXT_KEY, DEFAULT_RENDER_PROVIDER);
  const mergedOptions = computed<WidgetRenderContextOptions>(
    (): WidgetRenderContextOptions => ({
      ...parentProvider.options.value,
      ...options
    })
  );

  provide(WIDGET_RENDER_CONTEXT_KEY, {
    renderContext,
    options: mergedOptions
  });
}

/**
 * 注入最近的Widget渲染上下文。
 * @returns 响应式Widget渲染上下文状态
 */
export function useRenderContext(): WidgetRenderContextState {
  return inject(WIDGET_RENDER_CONTEXT_KEY, DEFAULT_RENDER_PROVIDER);
}
