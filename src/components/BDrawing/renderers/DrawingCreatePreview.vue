<!--
  @file DrawingCreatePreview.vue
  @description BDrawing 拖拽创建形状预览渲染组件。
-->
<template>
  <g class="b-drawing-create-preview" data-testid="drawing-create-preview">
    <polygon v-if="isDiamondShape" class="b-drawing-create-preview__shape" :points="diamondPoints" />
    <ellipse
      v-else-if="draft.shape === 'ellipse'"
      class="b-drawing-create-preview__shape"
      :cx="geometry.position.x + geometry.size.width / 2"
      :cy="geometry.position.y + geometry.size.height / 2"
      :rx="geometry.size.width / 2"
      :ry="geometry.size.height / 2"
    />
    <rect
      v-else
      class="b-drawing-create-preview__shape"
      :x="geometry.position.x"
      :y="geometry.position.y"
      :width="geometry.size.width"
      :height="geometry.size.height"
      :rx="draft.shape === 'text' ? 0 : 10"
    />
  </g>
</template>

<script setup lang="ts">
import type { DrawingInteractionDraft, DrawingPoint, DrawingSize } from '../types';
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
