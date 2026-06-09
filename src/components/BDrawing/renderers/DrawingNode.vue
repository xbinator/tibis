<!--
  @file DrawingNode.vue
  @description BDrawing SVG 节点渲染组件。
-->
<template>
  <g
    class="b-drawing-node"
    :class="{ 'is-selected': selected }"
    data-testid="drawing-node"
    :transform="`translate(${node.position.x}, ${node.position.y})`"
    @pointerdown.stop="emit('select', node.id)"
  >
    <polygon v-if="node.type === 'decision'" class="b-drawing-node__shape" :points="diamondPoints" />
    <rect v-else class="b-drawing-node__shape" :width="node.size.width" :height="node.size.height" :rx="node.type === 'text' ? 0 : 10" />
    <text class="b-drawing-node__text" :x="node.size.width / 2" :y="node.size.height / 2">{{ node.text }}</text>
  </g>
</template>

<script setup lang="ts">
import type { DrawingNode } from '../types';
import { computed } from 'vue';

/**
 * 节点组件入参。
 */
interface Props {
  /** 节点 */
  node: DrawingNode;
  /** 是否选中 */
  selected?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  selected: false
});

const emit = defineEmits<{
  /** 选择节点 */
  select: [id: string];
}>();

const diamondPoints = computed<string>(() => {
  const halfWidth = props.node.size.width / 2;
  const halfHeight = props.node.size.height / 2;

  return `${halfWidth},0 ${props.node.size.width},${halfHeight} ${halfWidth},${props.node.size.height} 0,${halfHeight}`;
});
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
  filter: drop-shadow(0 8px 16px var(--color-control-outline));
  fill: var(--color-primary-bg);
  stroke: var(--color-primary);
}

.b-drawing-node__text {
  font-size: 13px;
  font-weight: 650;
  dominant-baseline: middle;
  pointer-events: none;
  text-anchor: middle;
  fill: var(--text-primary);
}
</style>
