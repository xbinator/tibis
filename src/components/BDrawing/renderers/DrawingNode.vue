<!--
  @file DrawingNode.vue
  @description BDrawing SVG 节点渲染组件。
-->
<template>
  <g
    class="b-drawing-node b-drawing-element"
    :class="{ 'is-selected': selected, 'is-text': isTextShape }"
    data-testid="drawing-node"
    :data-drawing-element-id="node.id"
    :data-drawing-shape="node.shape"
    :opacity="node.style?.opacity"
    :transform="nodeTransform"
    @dblclick.stop="emit('edit', node.id, $event)"
    @pointerdown.stop="emit('select', node.id, $event)"
    @pointerup="emit('release', node.id, $event)"
  >
    <polygon
      v-if="isDiamondShape"
      class="b-drawing-node__shape"
      data-testid="drawing-shape-diamond"
      :fill="node.style?.fill"
      :points="diamondPoints"
      :stroke="node.style?.stroke"
      :stroke-width="node.style?.strokeWidth"
      :style="shapeStyle"
    />
    <ellipse
      v-else-if="node.shape === 'ellipse'"
      class="b-drawing-node__shape"
      data-testid="drawing-shape-ellipse"
      :cx="renderSize.width / 2"
      :cy="renderSize.height / 2"
      :fill="node.style?.fill"
      :rx="renderSize.width / 2"
      :ry="renderSize.height / 2"
      :stroke="node.style?.stroke"
      :stroke-width="node.style?.strokeWidth"
      :style="shapeStyle"
    />
    <rect
      v-else
      class="b-drawing-node__shape"
      data-testid="drawing-shape-rect"
      :fill="shapeFill"
      :width="renderSize.width"
      :height="renderSize.height"
      :stroke="shapeStroke"
      :stroke-width="shapeStrokeWidth"
      :style="shapeStyle"
    />
    <text
      v-if="!editing"
      alignment-baseline="central"
      class="b-drawing-node__text"
      dominant-baseline="central"
      :fill="textFill"
      :style="textStyle"
      :text-anchor="textAnchor"
      :x="textX"
      :y="textY"
    >
      <tspan
        v-for="(line, index) in textLineItems"
        :key="`${index}-${line.text}`"
        class="b-drawing-node__text-line"
        :data-drawing-empty-line="line.empty ? 'true' : undefined"
        :dy="index === 0 ? 0 : textLineHeight"
        :x="textX"
      >
        {{ line.text }}
      </tspan>
    </text>
    <g v-if="showConnectorAnchors" class="b-drawing-node__anchors">
      <circle
        v-for="anchor in connectorAnchors"
        :key="anchor.id"
        class="b-drawing-node__anchor"
        :class="{ 'is-active': isConnectorAnchorActive(anchor.id) }"
        :data-drawing-anchor="anchor.id"
        :cx="anchor.x"
        :cy="anchor.y"
        :r="isConnectorAnchorActive(anchor.id) ? 6 : 4"
      />
    </g>
  </g>
</template>

<script setup lang="ts">
import type { DrawingConnectorAnchor, DrawingShapeElement, DrawingSize } from '../types';
import type { CSSProperties } from 'vue';
import { computed } from 'vue';
import {
  DRAWING_TEXT_DEFAULT_FONT_SIZE,
  DRAWING_TEXT_DEFAULT_FONT_WEIGHT,
  DRAWING_TEXT_HORIZONTAL_PADDING,
  DRAWING_TEXT_LINE_HEIGHT_RATIO,
  DRAWING_TEXT_VERTICAL_PADDING
} from '../utils/boardTransforms';
import { createDrawingDiamondPoints, createDrawingElementTransform, getDrawingShapeRenderSize, isDrawingDiamondShape } from '../utils/drawingGeometry';
import { createDrawingTextLineItems, wrapDrawingTextLineItems } from '../utils/drawingTextMetrics';

/**
 * 节点组件入参。
 */
interface Props {
  /** 节点 */
  node: DrawingShapeElement;
  /** 是否选中 */
  selected?: boolean;
  /** 是否处于文本编辑态 */
  editing?: boolean;
  /** 当前激活的连接锚点 */
  activeConnectorAnchor?: DrawingConnectorAnchor | null;
  /** 是否显示连接锚点 */
  showConnectorAnchors?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  activeConnectorAnchor: null,
  editing: false,
  selected: false,
  showConnectorAnchors: false
});

const emit = defineEmits<{
  /** 编辑节点 */
  edit: [id: string, event: MouseEvent];
  /** 选择节点 */
  select: [id: string, event: PointerEvent];
  /** 在节点上释放指针 */
  release: [id: string, event: PointerEvent];
}>();

const isDiamondShape = computed<boolean>(() => isDrawingDiamondShape(props.node.shape));
/** 是否为文本元素。 */
const isTextShape = computed<boolean>(() => props.node.shape === 'text');
/** 节点渲染尺寸，文本节点始终按内容重新测量。 */
const renderSize = computed<DrawingSize>(() => getDrawingShapeRenderSize(props.node));
const nodeTransform = computed<string>(() => createDrawingElementTransform(props.node.position, renderSize.value, props.node.rotation));
const diamondPoints = computed<string>(() => createDrawingDiamondPoints(renderSize.value));
const shapeFill = computed<string | undefined>(() => (isTextShape.value ? props.node.style?.fill ?? 'transparent' : props.node.style?.fill));
const shapeStroke = computed<string | undefined>(() => (isTextShape.value ? props.node.style?.stroke ?? 'transparent' : props.node.style?.stroke));
const shapeStrokeWidth = computed<number | undefined>(() => (isTextShape.value ? props.node.style?.strokeWidth ?? 0 : props.node.style?.strokeWidth));
const shapeStyle = computed<CSSProperties>(() => ({
  fill: shapeFill.value,
  stroke: shapeStroke.value,
  strokeWidth: shapeStrokeWidth.value === undefined ? undefined : String(shapeStrokeWidth.value)
}));
/** 文本字号。 */
const textFontSize = computed<number>(() => props.node.style?.fontSize ?? DRAWING_TEXT_DEFAULT_FONT_SIZE);
/** SVG 文本行高。 */
const textLineHeight = computed<number>(() => textFontSize.value * DRAWING_TEXT_LINE_HEIGHT_RATIO);
/** 文本颜色。 */
const textFill = computed<string | undefined>(() => props.node.style?.color);
const textStyle = computed<CSSProperties>(() => ({
  fill: props.node.style?.color,
  fontSize: `${textFontSize.value}px`,
  fontWeight: String(props.node.style?.fontWeight ?? DRAWING_TEXT_DEFAULT_FONT_WEIGHT)
}));
/** 节点文本按换行拆分后的渲染行，空行使用占位保证 SVG 行距稳定。 */
const textLineItems = computed<Array<{ text: string; empty: boolean }>>(() =>
  isTextShape.value ? createDrawingTextLineItems(props.node.text) : wrapDrawingTextLineItems(props.node.text, renderSize.value.width, props.node.style)
);
/** 文本锚点。 */
const textAnchor = computed<'start' | 'middle' | 'end'>(() => {
  if (props.node.style?.textAlign === 'left') {
    return 'start';
  }
  if (props.node.style?.textAlign === 'right') {
    return 'end';
  }

  return 'middle';
});
/** 文本横向位置。 */
const textX = computed<number>(() => {
  if (props.node.style?.textAlign === 'left') {
    return DRAWING_TEXT_HORIZONTAL_PADDING / 2;
  }
  if (props.node.style?.textAlign === 'right') {
    return renderSize.value.width - DRAWING_TEXT_HORIZONTAL_PADDING / 2;
  }

  return renderSize.value.width / 2;
});
/** 文本块高度。 */
const textBlockHeight = computed<number>(() => Math.max(1, textLineItems.value.length) * textLineHeight.value);
/** 文本纵向位置，按配置在节点外框内垂直对齐。 */
const textY = computed<number>(() => {
  const verticalPadding = DRAWING_TEXT_VERTICAL_PADDING / 2;
  const firstLineOffset = textLineHeight.value / 2;
  if (props.node.style?.textVerticalAlign === 'top') {
    return verticalPadding + firstLineOffset;
  }
  if (props.node.style?.textVerticalAlign === 'bottom') {
    return renderSize.value.height - verticalPadding - textBlockHeight.value + firstLineOffset;
  }

  return renderSize.value.height / 2 - ((textLineItems.value.length - 1) * textLineHeight.value) / 2;
});
const connectorAnchors = computed<Array<{ id: Exclude<DrawingConnectorAnchor, 'center'>; x: number; y: number }>>(() => [
  { id: 'top', x: renderSize.value.width / 2, y: 0 },
  { id: 'right', x: renderSize.value.width, y: renderSize.value.height / 2 },
  { id: 'bottom', x: renderSize.value.width / 2, y: renderSize.value.height },
  { id: 'left', x: 0, y: renderSize.value.height / 2 }
]);

/**
 * 判断连接锚点是否处于当前激活状态。
 * @param anchor - 锚点 ID
 * @returns 是否激活
 */
function isConnectorAnchorActive(anchor: Exclude<DrawingConnectorAnchor, 'center'>): boolean {
  return props.activeConnectorAnchor === anchor || props.activeConnectorAnchor === 'center';
}
</script>

<style lang="less" scoped>
.b-drawing-node {
  cursor: pointer;
}

.b-drawing-node__shape {
  fill: var(--bg-elevated);
  stroke: var(--border-hover);
  stroke-width: 1.5;
  transition: fill 0.15s ease, stroke 0.15s ease, filter 0.15s ease;
}

.b-drawing-node.is-selected .b-drawing-node__shape {
  stroke: var(--color-primary);
}

.b-drawing-node.is-text.is-selected .b-drawing-node__shape {
  stroke: transparent;
}

.b-drawing-node__text {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 13px;
  font-weight: 650;
  pointer-events: none;
  text-anchor: middle;
  fill: var(--text-primary);
}

.b-drawing-node__anchor {
  pointer-events: none;
  fill: var(--bg-primary);
  stroke: var(--color-primary);
  stroke-width: 2;
  transition: fill 0.15s ease, r 0.15s ease, stroke-width 0.15s ease;
}

.b-drawing-node__anchor.is-active {
  filter: drop-shadow(0 0 7px color-mix(in srgb, var(--color-primary) 45%, transparent));
  fill: var(--color-primary);
  stroke: var(--bg-primary);
  stroke-width: 2.5;
}
</style>
