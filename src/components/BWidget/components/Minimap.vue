<!--
  @file Minimap.vue
  @description BWidget 轻量小地图组件，支持展开预览、点击定位视口中心和拖拽视口矩形移动位置。
-->
<template>
  <BDropdown v-model:open="open" :trigger="['click']" placement="topLeft" :align="WIDGET_MINIMAP_DROPDOWN_ALIGN">
    <slot :open="open"></slot>

    <template #overlay>
      <div class="b-widget-minimap__panel">
        <svg class="b-widget-minimap__svg" :viewBox="viewBox" @pointerdown="handlePointerdown" @wheel.prevent="handleWheel">
          <template v-for="element in shapeElements" :key="element.id">
            <rect
              class="b-widget-minimap__shape"
              :x="element.position.x"
              :y="element.position.y"
              :width="getWidgetShapeRenderSize(element).width"
              :height="getWidgetShapeRenderSize(element).height"
            ></rect>
          </template>
          <rect
            class="b-widget-minimap__viewport"
            :class="{ 'is-dragging': isDragging }"
            :x="viewportFrame.x"
            :y="viewportFrame.y"
            :width="viewportFrame.width"
            :height="viewportFrame.height"
            @pointerdown.stop="handleViewportDragStart"
          ></rect>
        </svg>
      </div>
    </template>
  </BDropdown>
</template>

<script setup lang="ts">
import type { WidgetElement, WidgetPoint, WidgetShapeElement, WidgetSize, WidgetViewport } from '../types';
import type { VNodeChild } from 'vue';
import { computed, ref } from 'vue';
import { useEventListener } from '@vueuse/core';
import { throttle } from 'lodash-es';
import BDropdown from '@/components/BDropdown/index.vue';
import { WIDGET_MINIMAP_DROPDOWN_ALIGN, WIDGET_MINIMAP_EMPTY_SIZE, WIDGET_MINIMAP_VIEWBOX_PADDING } from '../constants/minimap';
import { WIDGET_MAX_ZOOM, WIDGET_MIN_ZOOM, WIDGET_ZOOM_STEP } from '../constants/viewport';
import { getWidgetResponsiveViewBoxSize, getWidgetShapeRenderSize } from '../utils/widgetGeometry';

/**
 * 小地图边界。
 */
interface MinimapBounds {
  /** 左侧坐标 */
  minX: number;
  /** 顶部坐标 */
  minY: number;
  /** 右侧坐标 */
  maxX: number;
  /** 底部坐标 */
  maxY: number;
}

/**
 * 小地图视口矩形。
 */
interface MinimapRect {
  /** 左上角横坐标 */
  x: number;
  /** 左上角纵坐标 */
  y: number;
  /** 宽度 */
  width: number;
  /** 高度 */
  height: number;
}

/**
 * 小地图触发器插槽参数。
 */
interface MinimapTriggerSlotProps {
  /** 当前弹框是否展开 */
  open: boolean;
}

/**
 * 小地图组件入参。
 */
interface Props {
  /** Widget元素列表 */
  elements: WidgetElement[];
  /** 当前视口 */
  viewport: WidgetViewport;
  /** 当前视口渲染尺寸 */
  viewportSize: WidgetSize;
}

const props = defineProps<Props>();
defineSlots<{
  /** 渲染小地图触发器。 */
  default(props: MinimapTriggerSlotProps): VNodeChild;
}>();
const emit = defineEmits<{
  /** 设置视口中心 */
  'set-center': [center: WidgetPoint];
  /** 设置缩放比例 */
  'set-zoom': [zoom: number];
}>();

/** 小地图是否展开。 */
const open = ref<boolean>(false);

/**
 * 创建小地图覆盖范围。
 * @param elements - 形状元素列表
 * @param viewport - 当前视口矩形
 * @returns 小地图覆盖范围
 */
function createMinimapBounds(elements: WidgetShapeElement[], viewport: MinimapRect): MinimapBounds {
  const baseBounds = elements.reduce<MinimapBounds>(
    (nextBounds: MinimapBounds, element: WidgetShapeElement): MinimapBounds => {
      const size = getWidgetShapeRenderSize(element);

      return {
        minX: Math.min(nextBounds.minX, element.position.x),
        minY: Math.min(nextBounds.minY, element.position.y),
        maxX: Math.max(nextBounds.maxX, element.position.x + size.width),
        maxY: Math.max(nextBounds.maxY, element.position.y + size.height)
      };
    },
    {
      minX: viewport.x,
      minY: viewport.y,
      maxX: viewport.x + viewport.width,
      maxY: viewport.y + viewport.height
    }
  );

  const width = Math.max(baseBounds.maxX - baseBounds.minX, WIDGET_MINIMAP_EMPTY_SIZE);
  const height = Math.max(baseBounds.maxY - baseBounds.minY, WIDGET_MINIMAP_EMPTY_SIZE);
  const center = {
    x: (baseBounds.minX + baseBounds.maxX) / 2,
    y: (baseBounds.minY + baseBounds.maxY) / 2
  };

  return {
    minX: center.x - width / 2 - WIDGET_MINIMAP_VIEWBOX_PADDING,
    minY: center.y - height / 2 - WIDGET_MINIMAP_VIEWBOX_PADDING,
    maxX: center.x + width / 2 + WIDGET_MINIMAP_VIEWBOX_PADDING,
    maxY: center.y + height / 2 + WIDGET_MINIMAP_VIEWBOX_PADDING
  };
}

const shapeElements = computed<WidgetShapeElement[]>(() => props.elements);

const viewportFrame = computed<MinimapRect>(() => {
  const size = getWidgetResponsiveViewBoxSize(props.viewport.zoom, props.viewportSize);

  return {
    x: props.viewport.center.x - size.width / 2,
    y: props.viewport.center.y - size.height / 2,
    width: size.width,
    height: size.height
  };
});

const bounds = computed<MinimapBounds>(() => createMinimapBounds(shapeElements.value, viewportFrame.value));
const viewBox = computed<string>(() => {
  const width = bounds.value.maxX - bounds.value.minX;
  const height = bounds.value.maxY - bounds.value.minY;

  return `${bounds.value.minX} ${bounds.value.minY} ${width} ${height}`;
});

const isDragging = ref<boolean>(false);

/** 拖拽起始时鼠标在 SVG 坐标系中的位置。 */
const dragStartSvgPoint = ref<WidgetPoint>({ x: 0, y: 0 });

/** 拖拽起始时的视口中心。 */
const dragStartCenter = ref<WidgetPoint>({ x: 0, y: 0 });

/**
 * 将客户端坐标转换为 SVG 坐标系中的坐标。
 * @param clientX - 客户端横坐标
 * @param clientY - 客户端纵坐标
 * @returns SVG 坐标系中的坐标
 */
function clientToSvgPoint(clientX: number, clientY: number): WidgetPoint {
  const svgEl = document.querySelector('.b-widget-minimap__svg') as SVGSVGElement | null;
  if (!svgEl) {
    return { x: 0, y: 0 };
  }

  const rect = svgEl.getBoundingClientRect();
  const width = bounds.value.maxX - bounds.value.minX;
  const height = bounds.value.maxY - bounds.value.minY;

  return {
    x: bounds.value.minX + ((clientX - rect.left) / rect.width) * width,
    y: bounds.value.minY + ((clientY - rect.top) / rect.height) * height
  };
}

/**
 * 开始拖拽视口矩形。
 * @param event - 指针事件
 */
function handleViewportDragStart(event: PointerEvent): void {
  event.preventDefault();
  isDragging.value = true;
  dragStartSvgPoint.value = clientToSvgPoint(event.clientX, event.clientY);
  dragStartCenter.value = { ...props.viewport.center };
}

/**
 * 拖拽移动视口矩形。
 * @param event - 指针事件
 */
function handleViewportDragMove(event: PointerEvent): void {
  if (!isDragging.value) {
    return;
  }

  const currentSvgPoint = clientToSvgPoint(event.clientX, event.clientY);
  const dx = currentSvgPoint.x - dragStartSvgPoint.value.x;
  const dy = currentSvgPoint.y - dragStartSvgPoint.value.y;

  emit('set-center', {
    x: dragStartCenter.value.x + dx,
    y: dragStartCenter.value.y + dy
  });
}

/** 结束拖拽视口矩形。 */
function handleViewportDragEnd(): void {
  isDragging.value = false;
}

/**
 * 滚轮缩放视口。
 * @param event - 滚轮事件
 */
function handleWheel(event: WheelEvent): void {
  const direction = event.deltaY < 0 ? 1 : -1;
  const newZoom = Math.round((props.viewport.zoom + direction * WIDGET_ZOOM_STEP) * 10) / 10;

  if (newZoom < WIDGET_MIN_ZOOM || newZoom > WIDGET_MAX_ZOOM) {
    return;
  }

  emit('set-zoom', newZoom);
}

useEventListener(window, 'pointermove', throttle(handleViewportDragMove, 16));
useEventListener(window, 'pointerup', handleViewportDragEnd);

/**
 * 根据小地图点击位置设置视口中心。
 * @param event - 指针事件
 */
function handlePointerdown(event: PointerEvent): void {
  const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
  if (!rect.width || !rect.height) {
    return;
  }

  const width = bounds.value.maxX - bounds.value.minX;
  const height = bounds.value.maxY - bounds.value.minY;

  emit('set-center', {
    x: bounds.value.minX + ((event.clientX - rect.left) / rect.width) * width,
    y: bounds.value.minY + ((event.clientY - rect.top) / rect.height) * height
  });
}
</script>

<style lang="less" scoped>
.b-widget-minimap__panel {
  width: 320px;
  height: 188px;
  background: var(--dropdown-bg);
  border-radius: 8px;
  box-shadow: var(--shadow-dropdown);
}

.b-widget-minimap__svg {
  display: block;
  width: 100%;
  height: 100%;
  cursor: crosshair;
  background: transparent;
}

.b-widget-minimap__shape {
  fill: color-mix(in srgb, var(--color-primary) 10%, transparent);
  vector-effect: non-scaling-stroke;
}

.b-widget-minimap__viewport {
  cursor: grab;
  fill: transparent;
  stroke: var(--color-primary);
  stroke-width: 2;
  stroke-linejoin: round;
  rx: 24px;
  ry: 24px;
  vector-effect: non-scaling-stroke;

  &.is-dragging {
    cursor: grabbing;
  }
}
</style>
