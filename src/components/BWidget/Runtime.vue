<!--
  @file Runtime.vue
  @description BWidget 运行态内容边界只读Widget视图。
-->
<template>
  <section ref="rootRef" :class="name" :style="rootStyle">
    <div :class="bem('stage-viewport')" :style="stageViewportStyle">
      <div :class="bem('stage')" :style="stageStyle">
        <WidgetNode
          v-for="item in runtimeElements"
          :key="item.node.id"
          :node="item.node"
          :preview-size="item.renderSize"
          @context-menu="ignoreContextMenu"
          @release="ignoreNodeEvent"
          @select="ignoreNodeEvent"
          @submit="handleNodeSubmit"
        />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { WidgetData, WidgetShapeElement, WidgetSize } from './types';
import type { WidgetRenderContext } from 'types/widget';
import type { CSSProperties } from 'vue';
import { computed } from 'vue';
import { createNamespace } from '@/utils/namespace';
import { provideRenderContext } from './hooks/useRenderContext';
import { useViewportSize } from './hooks/useViewportSize';
import { provideWidgetRuntime, type WidgetRuntimeController } from './hooks/useWidgetRuntime';
import WidgetNode from './renderers/WidgetNode.vue';
import { createWidgetRuntimeLayout, type WidgetRuntimeElementLayout } from './utils/widgetRuntimeLayout';

defineOptions({ name: 'BWidgetRuntime' });

/**
 * 运行态Widget视图入参。
 */
interface Props {
  /** Widget模板值 */
  value: WidgetData;
  /** 运行态渲染上下文 */
  renderContext: WidgetRenderContext;
  /** 运行态控制器，供元素自行调用JS 脚本 methods */
  runtime?: WidgetRuntimeController;
  /** 内容留白 */
  padding?: number;
}

/**
 * 运行态可渲染元素。
 */
interface WidgetRuntimeRenderableElement {
  /** 已平移到运行态坐标的节点 */
  node: WidgetShapeElement;
  /** 布局测量时使用的渲染尺寸 */
  renderSize: WidgetSize;
}

const props = withDefaults(defineProps<Props>(), {
  padding: 16,
  runtime: undefined
});

const emit = defineEmits<{
  /** 提交运行态输出 */
  submit: [output: unknown];
}>();

const [name, bem] = createNamespace('widget-runtime');
const { viewportSize } = useViewportSize('rootRef');

/** 运行态渲染上下文响应式包装。 */
const providedRenderContext = computed<WidgetRenderContext | undefined>(() => props.renderContext);
/** 运行态控制器响应式包装。 */
const providedRuntime = computed<WidgetRuntimeController | undefined>(() => props.runtime);

provideRenderContext(providedRenderContext);
provideWidgetRuntime(providedRuntime);

/** 当前运行态内容布局。 */
const runtimeLayout = computed(() => createWidgetRuntimeLayout(props.value.elements, props.renderContext, props.padding));
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
/** 运行态渲染元素，使用平移后的内容边界坐标，不修改来源Widget数据。 */
const runtimeElements = computed<WidgetRuntimeRenderableElement[]>(() =>
  runtimeLayout.value.elements.map(
    (item: WidgetRuntimeElementLayout): WidgetRuntimeRenderableElement => ({
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

/**
 * 向使用方透传运行态节点提交结果。
 * @param output - 节点提交输出
 */
function handleNodeSubmit(output: unknown): void {
  emit('submit', output);
}
</script>

<style lang="less" scoped>
.b-widget-runtime {
  position: relative;
  width: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-primary);
}

.b-widget-runtime__stage-viewport {
  position: relative;
  width: 100%;
  overflow: hidden;
}

.b-widget-runtime__stage {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
}

.b-widget-runtime :deep(.b-widget-node) {
  cursor: default;
}
</style>
