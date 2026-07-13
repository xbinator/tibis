/**
 * @file useRuntimeLayout.ts
 * @description BWidget 运行态展示尺寸与内容缩放布局 hook。
 */
import type { WidgetData, WidgetPoint, WidgetSize } from '../types';
import type { ComputedRef, Ref } from 'vue';
import { computed } from 'vue';
import { isFinite as isFiniteNumber, isNumber } from 'lodash-es';

/**
 * Widget 运行态展示尺寸 metadata。
 */
export interface WidgetRuntimeDisplaySize {
  /** 运行态展示宽度 */
  width?: number;
  /** 运行态展示高度 */
  height?: number;
}

/**
 * 运行态展示布局。
 */
export interface WidgetRuntimeDisplayLayout {
  /** 响应式运行态展示盒子宽度，空内容时不设置 */
  width?: number;
  /** 运行态展示盒子高度 */
  height: number;
  /** 内容舞台缩放比例 */
  scale: number;
  /** 内容舞台在展示盒子中的偏移 */
  stageOffset: WidgetPoint;
}

/**
 * 运行态展示布局 hook 参数。
 */
interface UseRuntimeLayoutOptions {
  /** 当前 Widget 数据 */
  widgetData: ComputedRef<WidgetData>;
  /** 运行态内容边界尺寸 */
  contentSize: ComputedRef<WidgetSize>;
  /** 是否存在可渲染元素 */
  hasRenderableElements: ComputedRef<boolean>;
  /** 宿主可用视口尺寸 */
  viewportSize: Ref<WidgetSize>;
}

/**
 * 运行态展示布局 hook 返回值。
 */
interface UseRuntimeLayoutReturn {
  /** 当前运行态展示尺寸配置 */
  runtimeDisplaySize: ComputedRef<WidgetRuntimeDisplaySize>;
  /** 当前运行态展示布局 */
  runtimeDisplayLayout: ComputedRef<WidgetRuntimeDisplayLayout>;
}

/**
 * 读取 Widget 运行态展示尺寸 metadata。
 * @param value - Widget 数据
 * @returns 运行态展示尺寸
 */
function readRuntimeDisplaySize(value: WidgetData): WidgetRuntimeDisplaySize {
  const { width, height } = value.metadata;

  return {
    width: isNumber(width) && isFiniteNumber(width) && width > 0 ? width : undefined,
    height: isNumber(height) && isFiniteNumber(height) && height > 0 ? height : undefined
  };
}

/**
 * 根据内容尺寸、metadata 尺寸与宿主宽度创建运行态展示布局。
 * @param contentSize - 内容边界尺寸
 * @param displaySize - metadata 展示尺寸
 * @param hostWidth - 宿主可用宽度
 * @param hasRenderableElements - 是否存在可渲染元素
 * @returns 运行态展示布局
 */
function createRuntimeDisplayLayout(
  contentSize: WidgetSize,
  displaySize: WidgetRuntimeDisplaySize,
  hostWidth: number,
  hasRenderableElements: boolean
): WidgetRuntimeDisplayLayout {
  if (!hasRenderableElements || !contentSize.width || !contentSize.height) {
    return {
      height: contentSize.height,
      scale: 1,
      stageOffset: { x: 0, y: 0 }
    };
  }

  // 1. 根据 metadata 创建基础展示盒子；缺失的单边按内容比例推导。
  const widthScale = displaySize.width === undefined ? Number.POSITIVE_INFINITY : displaySize.width / contentSize.width;
  const heightScale = displaySize.height === undefined ? Number.POSITIVE_INFINITY : displaySize.height / contentSize.height;
  const calculatedBaseScale = Math.min(widthScale, heightScale);
  const baseScale = isFiniteNumber(calculatedBaseScale) ? calculatedBaseScale : 1;
  const baseWidth = displaySize.width ?? contentSize.width * baseScale;
  const baseHeight = displaySize.height ?? contentSize.height * baseScale;
  const baseOffset: WidgetPoint = {
    x: Math.max((baseWidth - contentSize.width * baseScale) / 2, 0),
    y: Math.max((baseHeight - contentSize.height * baseScale) / 2, 0)
  };

  // 2. 配置 metadata 时不超过基础展示盒子；未配置时继续填满宿主宽度。
  const constrainToBaseSize = displaySize.width !== undefined || displaySize.height !== undefined;
  const hostScale = hostWidth > 0 ? hostWidth / baseWidth : 1;
  const responsiveScale = constrainToBaseSize ? Math.min(hostScale, 1) : hostScale;
  const availableWidth = hostWidth > 0 ? hostWidth : baseWidth;
  const displayWidth = constrainToBaseSize ? Math.min(availableWidth, baseWidth) : availableWidth;

  return {
    width: displayWidth,
    height: baseHeight * responsiveScale,
    scale: baseScale * responsiveScale,
    stageOffset: {
      x: baseOffset.x * responsiveScale,
      y: baseOffset.y * responsiveScale
    }
  };
}

/**
 * 创建 Widget 运行态展示布局。
 * @param options - hook 参数
 * @returns 运行态展示布局状态
 */
export function useRuntimeLayout(options: UseRuntimeLayoutOptions): UseRuntimeLayoutReturn {
  const runtimeDisplaySize = computed<WidgetRuntimeDisplaySize>(() => readRuntimeDisplaySize(options.widgetData.value));
  const runtimeDisplayLayout = computed<WidgetRuntimeDisplayLayout>(() =>
    createRuntimeDisplayLayout(options.contentSize.value, runtimeDisplaySize.value, options.viewportSize.value.width, options.hasRenderableElements.value)
  );

  return {
    runtimeDisplaySize,
    runtimeDisplayLayout
  };
}
