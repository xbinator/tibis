<!--
  @file DrawingCreatePreview.vue
  @description BDrawing 拖拽创建形状预览渲染组件。
-->
<template>
  <g class="b-drawing-create-preview" data-testid="drawing-create-preview">
    <polygon
      v-if="isDiamondShape"
      class="b-drawing-create-preview__shape"
      :fill="draftStyle?.fill"
      :points="diamondPoints"
      :stroke="draftStyle?.stroke"
      :stroke-width="draftStyle?.strokeWidth"
      :style="shapeStyle"
    />
    <ellipse
      v-else-if="draft.shape === 'ellipse'"
      class="b-drawing-create-preview__shape"
      :cx="geometry.position.x + geometry.size.width / 2"
      :cy="geometry.position.y + geometry.size.height / 2"
      :fill="draftStyle?.fill"
      :rx="geometry.size.width / 2"
      :ry="geometry.size.height / 2"
      :stroke="draftStyle?.stroke"
      :stroke-width="draftStyle?.strokeWidth"
      :style="shapeStyle"
    />
    <rect
      v-else
      class="b-drawing-create-preview__shape"
      :fill="draftStyle?.fill"
      :x="geometry.position.x"
      :y="geometry.position.y"
      :width="geometry.size.width"
      :height="geometry.size.height"
      :rx="draft.shape === 'process' ? 10 : undefined"
      :stroke="draftStyle?.stroke"
      :stroke-width="draftStyle?.strokeWidth"
      :style="shapeStyle"
    />
  </g>
</template>

<script setup lang="ts">
import type { DrawingElementStyle, DrawingInteractionDraft, DrawingPoint, DrawingSize } from '../types';
import type { CSSProperties } from 'vue';
import { computed } from 'vue';
import { createDrawingDiamondPoints, isDrawingDiamondShape } from '../utils/drawingGeometry';

/**
 * 创建形状草稿。
 */
type DrawingCreateShapeDraft = Extract<DrawingInteractionDraft, { kind: 'creating-shape' }>;

/**
 * 创建预览组件入参。
 */
interface Props {
  /** 当前创建草稿 */
  draft: DrawingCreateShapeDraft;
  /** 创建草稿样式 */
  draftStyle?: DrawingElementStyle;
}

const props = defineProps<Props>();

const geometry = computed<{ position: DrawingPoint; size: DrawingSize }>(() => {
  const width = Math.abs(props.draft.current.x - props.draft.start.x);
  const height = Math.abs(props.draft.current.y - props.draft.start.y);

  return {
    position: {
      x: Math.min(props.draft.start.x, props.draft.current.x),
      y: Math.min(props.draft.start.y, props.draft.current.y)
    },
    size: {
      width,
      height
    }
  };
});

const isDiamondShape = computed<boolean>(() => isDrawingDiamondShape(props.draft.shape));
const diamondPoints = computed<string>(() => createDrawingDiamondPoints(geometry.value.size, geometry.value.position));
const shapeStyle = computed<CSSProperties>(() => ({
  fill: props.draftStyle?.fill,
  stroke: props.draftStyle?.stroke,
  strokeWidth: props.draftStyle?.strokeWidth === undefined ? undefined : String(props.draftStyle.strokeWidth)
}));
</script>

<style lang="less" scoped>
.b-drawing-create-preview__shape {
  pointer-events: none;
  fill: color-mix(in srgb, var(--color-primary-bg) 55%, transparent);
  stroke: var(--color-primary);
  stroke-width: 1.5;
  stroke-dasharray: 6 4;
}
</style>
