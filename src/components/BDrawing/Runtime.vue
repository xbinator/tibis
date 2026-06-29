<!--
  @file Runtime.vue
  @description BDrawing 运行态内容边界只读画布视图。
-->
<template>
  <section ref="rootRef" :class="name" :style="rootStyle">
    <div :class="bem('stage-viewport')" :style="stageViewportStyle">
      <div :class="bem('stage')" :style="stageStyle">
        <DrawingNode
          v-for="item in runtimeElements"
          :key="item.node.id"
          :node="item.node"
          :preview-size="item.renderSize"
          @context-menu="ignoreContextMenu"
          @release="ignoreNodeEvent"
          @select="ignoreNodeEvent"
        />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { DrawingData, DrawingRenderContext, DrawingShapeElement, DrawingSize } from './types';
import type { CSSProperties } from 'vue';
import { computed } from 'vue';
import { createNamespace } from '@/utils/namespace';
import { provideRenderContext } from './hooks/useRenderContext';
import { useViewportSize } from './hooks/useViewportSize';
import DrawingNode from './renderers/DrawingNode.vue';
import { createDrawingRuntimeLayout, type DrawingRuntimeElementLayout } from './utils/drawingRuntimeLayout';

defineOptions({ name: 'BDrawingRuntime' });

/**
 * 运行态画布视图入参。
 */
interface Props {
  /** 画布模板数据 */
  drawingData: DrawingData;
  /** 运行态渲染上下文 */
  renderContext: DrawingRenderContext;
  /** 内容留白 */
  padding?: number;
}

/**
 * 运行态可渲染元素。
 */
interface DrawingRuntimeRenderableElement {
  /** 已平移到运行态坐标的节点 */
  node: DrawingShapeElement;
  /** 布局测量时使用的渲染尺寸 */
  renderSize: DrawingSize;
}

const props = withDefaults(defineProps<Props>(), {
  padding: 16
});

const [name, bem] = createNamespace('drawing-runtime');
const { rootRef, viewportSize } = useViewportSize();

/** 运行态渲染上下文响应式包装。 */
const providedRenderContext = computed<DrawingRenderContext | undefined>(() => props.renderContext);

provideRenderContext(providedRenderContext);

/** 当前运行态内容布局。 */
const runtimeLayout = computed(() => createDrawingRuntimeLayout(props.drawingData.elements, props.renderContext, props.padding));
/** 当前运行态内容缩放比例。 */
const runtimeScale = computed<number>(() => {
  if (!runtimeLayout.value.elements.length) {
    return 1;
  }

  if (!viewportSize.value.width || !runtimeLayout.value.contentSize.width) {
    return 1;
  }

  return viewportSize.value.width / runtimeLayout.value.contentSize.width;
});
/** 缩放后的运行态视图高度。 */
const scaledHeight = computed<number>(() => runtimeLayout.value.contentSize.height * runtimeScale.value);
/** 运行态渲染元素，使用平移后的内容边界坐标，不修改来源画布数据。 */
const runtimeElements = computed<DrawingRuntimeRenderableElement[]>(() =>
  runtimeLayout.value.elements.map(
    (item: DrawingRuntimeElementLayout): DrawingRuntimeRenderableElement => ({
      node: {
        ...item.element,
        position: item.position
      },
      renderSize: item.renderSize
    })
  )
);
/** 运行态根节点样式。 */
const rootStyle = computed<CSSProperties>(() => ({
  height: `${scaledHeight.value}px`
}));
/** 运行态舞台裁剪容器样式。 */
const stageViewportStyle = computed<CSSProperties>(() => ({
  height: `${scaledHeight.value}px`
}));
/** 运行态内容舞台样式。 */
const stageStyle = computed<CSSProperties>(() => ({
  width: `${runtimeLayout.value.contentSize.width}px`,
  height: `${runtimeLayout.value.contentSize.height}px`,
  transform: `scale(${runtimeScale.value})`
}));

/**
 * 忽略运行态节点指针事件。
 */
function ignoreNodeEvent(): void {
  return undefined;
}

/**
 * 忽略运行态右键菜单事件。
 */
function ignoreContextMenu(): void {
  return undefined;
}
</script>

<style lang="less" scoped>
.b-drawing-runtime {
  position: relative;
  width: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-primary);
}

.b-drawing-runtime__stage-viewport {
  position: relative;
  width: 100%;
  overflow: hidden;
}

.b-drawing-runtime__stage {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
}

.b-drawing-runtime :deep(.b-drawing-node) {
  cursor: default;
}
</style>
