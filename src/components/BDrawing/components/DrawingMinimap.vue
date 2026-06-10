<!--
  @file DrawingMinimap.vue
  @description BDrawing 轻量小地图组件，支持展开预览和点击定位视口中心。
-->
<template>
  <BDropdown v-model:open="open" :trigger="['click']" placement="topLeft" :align="dropdownAlign">
    <slot :open="open"></slot>

    <template #overlay>
      <div class="b-drawing-minimap__panel">
        <svg class="b-drawing-minimap__svg" :viewBox="viewBox" @pointerdown="handlePointerdown">
          <line
            v-for="connector in connectorLines"
            :key="connector.id"
            class="b-drawing-minimap__connector"
            :x1="connector.source.x"
            :y1="connector.source.y"
            :x2="connector.target.x"
            :y2="connector.target.y"
          ></line>
          <template v-for="element in shapeElements" :key="element.id">
            <polygon
              v-if="isDrawingDiamondShape(element.shape)"
              class="b-drawing-minimap__shape"
              :points="createDrawingDiamondPoints(element.size, element.position)"
            ></polygon>
            <ellipse
              v-else-if="element.shape === 'ellipse'"
              class="b-drawing-minimap__shape"
              :cx="element.position.x + element.size.width / 2"
              :cy="element.position.y + element.size.height / 2"
              :rx="element.size.width / 2"
              :ry="element.size.height / 2"
            ></ellipse>
            <rect
              v-else
              class="b-drawing-minimap__shape"
              :x="element.position.x"
              :y="element.position.y"
              :width="element.size.width"
              :height="element.size.height"
              :rx="element.shape === 'text' ? 0 : 10"
            ></rect>
          </template>
          <rect
            class="b-drawing-minimap__viewport"
            :x="viewportFrame.x"
            :y="viewportFrame.y"
            :width="viewportFrame.width"
            :height="viewportFrame.height"
          ></rect>
        </svg>
      </div>
    </template>
  </BDropdown>
</template>

<script setup lang="ts">
import type { DrawingConnectorElement, DrawingElement, DrawingPoint, DrawingShapeElement, DrawingSize, DrawingViewport } from '../types';
import type { VNodeChild } from 'vue';
import { computed, ref } from 'vue';
import BDropdown from '@/components/BDropdown/index.vue';
import {
  createDrawingDiamondPoints,
  findDrawingShapeElement,
  getDrawingElementCenter,
  getDrawingResponsiveViewBoxSize,
  isDrawingConnectorElement,
  isDrawingDiamondShape,
  isDrawingShapeElement
} from '../utils/drawingGeometry';

const MINIMAP_EMPTY_SIZE = 320;
const MINIMAP_VIEWBOX_PADDING = 80;

/** 小地图弹框相对触发按钮的偏移。 */
const dropdownAlign = {
  offset: [0, -8] as [number, number]
};

/**
 * 小地图边界。
 */
interface DrawingMinimapBounds {
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
interface DrawingMinimapRect {
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
 * 小地图连接线。
 */
interface DrawingMinimapConnectorLine {
  /** 连接线 ID */
  id: string;
  /** 起点 */
  source: DrawingPoint;
  /** 终点 */
  target: DrawingPoint;
}

/**
 * 小地图触发器插槽参数。
 */
interface DrawingMinimapTriggerSlotProps {
  /** 当前弹框是否展开 */
  open: boolean;
}

/**
 * 小地图组件入参。
 */
interface Props {
  /** 画板元素列表 */
  elements: DrawingElement[];
  /** 当前视口 */
  viewport: DrawingViewport;
  /** 当前视口渲染尺寸 */
  viewportSize: DrawingSize;
}

const props = defineProps<Props>();
defineSlots<{
  /** 渲染小地图触发器。 */
  default(props: DrawingMinimapTriggerSlotProps): VNodeChild;
}>();
const emit = defineEmits<{
  /** 设置视口中心 */
  'set-center': [center: DrawingPoint];
}>();

/** 小地图是否展开。 */
const open = ref<boolean>(false);

/**
 * 创建小地图覆盖范围。
 * @param elements - 形状元素列表
 * @param viewport - 当前视口矩形
 * @returns 小地图覆盖范围
 */
function createMinimapBounds(elements: DrawingShapeElement[], viewport: DrawingMinimapRect): DrawingMinimapBounds {
  const baseBounds = elements.reduce<DrawingMinimapBounds>(
    (nextBounds: DrawingMinimapBounds, element: DrawingShapeElement): DrawingMinimapBounds => ({
      minX: Math.min(nextBounds.minX, element.position.x),
      minY: Math.min(nextBounds.minY, element.position.y),
      maxX: Math.max(nextBounds.maxX, element.position.x + element.size.width),
      maxY: Math.max(nextBounds.maxY, element.position.y + element.size.height)
    }),
    {
      minX: viewport.x,
      minY: viewport.y,
      maxX: viewport.x + viewport.width,
      maxY: viewport.y + viewport.height
    }
  );

  const width = Math.max(baseBounds.maxX - baseBounds.minX, MINIMAP_EMPTY_SIZE);
  const height = Math.max(baseBounds.maxY - baseBounds.minY, MINIMAP_EMPTY_SIZE);
  const center = {
    x: (baseBounds.minX + baseBounds.maxX) / 2,
    y: (baseBounds.minY + baseBounds.maxY) / 2
  };

  return {
    minX: center.x - width / 2 - MINIMAP_VIEWBOX_PADDING,
    minY: center.y - height / 2 - MINIMAP_VIEWBOX_PADDING,
    maxX: center.x + width / 2 + MINIMAP_VIEWBOX_PADDING,
    maxY: center.y + height / 2 + MINIMAP_VIEWBOX_PADDING
  };
}

const shapeElements = computed<DrawingShapeElement[]>(() => props.elements.filter(isDrawingShapeElement));
const connectorElements = computed<DrawingConnectorElement[]>(() => props.elements.filter(isDrawingConnectorElement));

const viewportFrame = computed<DrawingMinimapRect>(() => {
  const size = getDrawingResponsiveViewBoxSize(props.viewport.zoom, props.viewportSize);

  return {
    x: props.viewport.center.x - size.width / 2,
    y: props.viewport.center.y - size.height / 2,
    width: size.width,
    height: size.height
  };
});

const bounds = computed<DrawingMinimapBounds>(() => createMinimapBounds(shapeElements.value, viewportFrame.value));
const viewBox = computed<string>(() => {
  const width = bounds.value.maxX - bounds.value.minX;
  const height = bounds.value.maxY - bounds.value.minY;

  return `${bounds.value.minX} ${bounds.value.minY} ${width} ${height}`;
});

const connectorLines = computed<DrawingMinimapConnectorLine[]>(() =>
  connectorElements.value.flatMap((connector: DrawingConnectorElement): DrawingMinimapConnectorLine[] => {
    const source = findDrawingShapeElement(props.elements, connector.source.elementId);
    const target = findDrawingShapeElement(props.elements, connector.target.elementId);
    if (!source || !target) {
      return [];
    }

    return [
      {
        id: connector.id,
        source: getDrawingElementCenter(source),
        target: getDrawingElementCenter(target)
      }
    ];
  })
);

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
.b-drawing-minimap__panel {
  width: 320px;
  height: 188px;
  background: var(--dropdown-bg);
  border-radius: 8px;
  box-shadow: var(--shadow-dropdown);
}

.b-drawing-minimap__svg {
  display: block;
  width: 100%;
  height: 100%;
  cursor: crosshair;
  background: transparent;
}

.b-drawing-minimap__connector {
  stroke: color-mix(in srgb, var(--color-primary) 12%, transparent);
  stroke-width: 10;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}

.b-drawing-minimap__shape {
  fill: color-mix(in srgb, var(--color-primary) 10%, transparent);
  vector-effect: non-scaling-stroke;
}

.b-drawing-minimap__viewport {
  fill: transparent;
  rx: 24px;
  ry: 24px;
  stroke: var(--color-primary);
  stroke-width: 2;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}
</style>
