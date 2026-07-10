/**
 * @file useCanvasDrop.ts
 * @description Widget页面侧栏工具拖拽投放到画布的绑定逻辑。
 */
import type { WidgetComponentRef } from './types';
import type { Ref } from 'vue';
import { provideDragger, useDragger, type DraggerItem, type DraggerPoint } from './useDragger';

/**
 * Widget画布拖拽投放 hook 入参。
 */
export interface UseCanvasDropOptions {
  /** 画布外层节点引用 */
  canvasRef: Ref<HTMLElement | null>;
  /** Widget画布组件引用 */
  widgetRef: Ref<WidgetComponentRef | undefined>;
}

/**
 * 为Widget页面提供侧栏工具拖拽投放能力。
 * @param options - hook 入参
 */
export function useCanvasDrop(options: UseCanvasDropOptions): void {
  const elementDrag = useDragger({
    dropTargetRef: options.canvasRef,
    onDrop: (item: DraggerItem, point: DraggerPoint): void => {
      options.widgetRef.value?.createElementFromClientPoint(item.name, point);
    }
  });

  provideDragger(elementDrag);
}
