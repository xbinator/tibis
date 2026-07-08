/**
 * @file useWidgetRuntime.ts
 * @description BWidget 运行态实例 provide/inject hook。
 */
import { inject, provide, ref } from 'vue';
import type { InjectionKey, Ref } from 'vue';

/**
 * 小组件运行态控制器。
 */
export interface WidgetRuntimeController {
  /**
   * 运行 Widget 实例上的公开方法。
   * @param methodName - 方法名
   * @param args - 方法参数
   */
  run: (methodName: string, ...args: unknown[]) => void;
  /**
   * 运行元素自己声明的交互表达式。
   * @param interactionCode - 元素交互表达式
   */
  runInteraction: (interactionCode: string) => void;
}

/** 小组件运行态控制器注入键。 */
const WIDGET_RUNTIME_KEY: InjectionKey<Readonly<Ref<WidgetRuntimeController | undefined>>> = Symbol('BWidgetRuntime');
/** 未处于运行态 provider 下时使用的空控制器。 */
const EMPTY_RUNTIME = ref<WidgetRuntimeController | undefined>();

/**
 * 向下提供小组件运行态控制器。
 * @param runtime - 响应式运行态控制器
 */
export function provideWidgetRuntime(runtime: Readonly<Ref<WidgetRuntimeController | undefined>>): void {
  provide(WIDGET_RUNTIME_KEY, runtime);
}

/**
 * 注入最近的小组件运行态控制器。
 * @returns 响应式运行态控制器
 */
export function useWidgetRuntime(): Readonly<Ref<WidgetRuntimeController | undefined>> {
  return inject(WIDGET_RUNTIME_KEY, EMPTY_RUNTIME);
}
