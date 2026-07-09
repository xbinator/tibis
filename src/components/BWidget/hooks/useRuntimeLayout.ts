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
  /** 运行态展示盒子宽度，未设置时由宿主 CSS 决定 */
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
 * 将 metadata 中的展示尺寸归一化为正数。
 * @param value - 原始 metadata 值
 * @returns 可用尺寸，非法值返回 undefined
 */
function normalizeRuntimeDisplaySizeValue(value: unknown): number | undefined {
  return isNumber(value) && isFiniteNumber(value) && value > 0 ? value : undefined;
}

/**
 * 读取 Widget 运行态展示尺寸 metadata。
 * @param value - Widget 数据
 * @returns 运行态展示尺寸
 */
function readRuntimeDisplaySize(value: WidgetData): WidgetRuntimeDisplaySize {
  return {
    width: normalizeRuntimeDisplaySizeValue(value.metadata.width),
    height: normalizeRuntimeDisplaySizeValue(value.metadata.height)
  };
}

/**
 * 按宿主宽度等比压缩展示盒子。
 * @param box - 理想展示盒子
 * @param hostWidth - 宿主可用宽度
 * @returns 宿主约束后的展示盒子
 */
function constrainDisplayBoxToHost(box: WidgetSize, hostWidth: number): WidgetSize {
  if (!hostWidth || hostWidth >= box.width) {
    return box;
  }

  const scale = hostWidth / box.width;

  return {
    width: hostWidth,
    height: box.height * scale
  };
}

/**
 * 创建居中舞台偏移。
 * @param box - 展示盒子
 * @param contentSize - 原始内容尺寸
 * @param scale - 内容缩放比例
 * @returns 舞台偏移
 */
function createCenteredStageOffset(box: WidgetSize, contentSize: WidgetSize, scale: number): WidgetPoint {
  return {
    x: Math.max((box.width - contentSize.width * scale) / 2, 0),
    y: Math.max((box.height - contentSize.height * scale) / 2, 0)
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

  const hostScale = hostWidth ? hostWidth / contentSize.width : 1;
  const displayWidth = displaySize.width;
  const displayHeight = displaySize.height;

  if (displayWidth === undefined && displayHeight === undefined) {
    return {
      height: contentSize.height * hostScale,
      scale: hostScale,
      stageOffset: { x: 0, y: 0 }
    };
  }

  if (displayWidth !== undefined && displayHeight === undefined) {
    const idealScale = displayWidth / contentSize.width;
    const displayBox = constrainDisplayBoxToHost(
      {
        width: displayWidth,
        height: contentSize.height * idealScale
      },
      hostWidth
    );
    const scale = displayBox.width / contentSize.width;

    return {
      width: displayBox.width,
      height: displayBox.height,
      scale,
      stageOffset: { x: 0, y: 0 }
    };
  }

  if (displayWidth === undefined && displayHeight !== undefined) {
    const heightScale = displayHeight / contentSize.height;
    const scale = hostWidth ? Math.min(heightScale, hostScale) : heightScale;

    return {
      width: contentSize.width * scale,
      height: contentSize.height * scale,
      scale,
      stageOffset: { x: 0, y: 0 }
    };
  }

  if (displayWidth !== undefined && displayHeight !== undefined) {
    const idealBox: WidgetSize = {
      width: displayWidth,
      height: displayHeight
    };
    const displayBox = constrainDisplayBoxToHost(idealBox, hostWidth);
    const scale = Math.min(displayBox.width / contentSize.width, displayBox.height / contentSize.height);

    return {
      width: displayBox.width,
      height: displayBox.height,
      scale,
      stageOffset: createCenteredStageOffset(displayBox, contentSize, scale)
    };
  }

  return {
    height: contentSize.height * hostScale,
    scale: hostScale,
    stageOffset: { x: 0, y: 0 }
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
