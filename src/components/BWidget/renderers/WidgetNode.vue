<!--
  @file WidgetNode.vue
  @description BWidget HTML 节点渲染组件。
-->
<template>
  <div
    class="b-widget-node b-widget-element"
    :class="{ 'is-selected': selected, 'is-text': isTextShape }"
    data-testid="widget-node"
    :data-widget-element-id="node.id"
    :data-widget-name="node.name"
    :style="nodeStyle"
    @contextmenu.stop.prevent="emit('context-menu', node.id, $event)"
    @pointerdown.stop="emit('select', node.id, $event)"
    @pointerup="emit('release', node.id, $event)"
  >
    <component :is="nodeView" v-if="nodeView" :element="node" />
    <div v-else class="b-widget-node__fallback">{{ node.title }}</div>
  </div>
</template>

<script setup lang="ts">
import type { WidgetPoint, WidgetShapeElement, WidgetSize } from '../types';
import type { Component, CSSProperties } from 'vue';
import { computed } from 'vue';
import { getWidgetElementView } from '../elements';
import { useRenderContext } from '../hooks/useRenderContext';
import { createWidgetElementCssTransform, getWidgetShapeRenderSize } from '../utils/widgetGeometry';
import { createWidgetElementContentStyleProperties, createWidgetElementStyleProperties } from '../utils/widgetStyle';

/**
 * 节点组件入参。
 */
interface Props {
  /** 节点 */
  node: WidgetShapeElement;
  /** 预览位置 */
  previewPosition?: WidgetPoint | null;
  /** 预览尺寸 */
  previewSize?: WidgetSize | null;
  /** 是否选中 */
  selected?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  previewPosition: null,
  previewSize: null,
  selected: false
});

const emit = defineEmits<{
  /** 选择节点 */
  select: [id: string, event: PointerEvent];
  /** 在节点上释放指针 */
  release: [id: string, event: PointerEvent];
  /** 打开节点右键菜单 */
  'context-menu': [id: string, event: MouseEvent];
}>();

/** 当前Widget渲染上下文。 */
const renderContext = useRenderContext();
/** 是否为文本元素。 */
const isTextShape = computed<boolean>(() => props.node.name === 'text');
/** 节点渲染尺寸，文本节点始终按内容重新测量。 */
const renderSize = computed<WidgetSize>(() => props.previewSize ?? getWidgetShapeRenderSize(props.node, renderContext.value));
/** 节点渲染位置，Moveable 预览时优先使用临时位置。 */
const renderPosition = computed<WidgetPoint>(() => props.previewPosition ?? props.node.position);
/** 当前节点对应的中间视图组件。 */
const nodeView = computed<Component | null>(() => getWidgetElementView(props.node.name));
/** HTML 节点定位和几何样式。 */
const nodeStyle = computed<CSSProperties>(() => ({
  ...createWidgetElementStyleProperties(props.node.style),
  ...createWidgetElementContentStyleProperties(props.node.style),
  width: `${renderSize.value.width}px`,
  height: `${renderSize.value.height}px`,
  opacity: props.node.style.opacity,
  transform: createWidgetElementCssTransform(renderPosition.value, props.node.rotation)
}));
</script>

<style lang="less" scoped>
.b-widget-node {
  position: absolute;
  top: 0;
  left: 0;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-primary);
  cursor: pointer;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  transform-origin: center center;
}

.b-widget-node.is-text {
  font-size: 13px;
  line-height: 1.35;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  background: transparent;
  border-color: transparent;
}

.b-widget-node__fallback {
  padding: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: pre-wrap;
}
</style>
