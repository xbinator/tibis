<!--
  @file index.vue
  @description BDrawing 文本元素中间画布视图。
-->
<template>
  <span class="drawing-text-element-view">{{ textContent }}</span>
</template>

<script setup lang="ts">
import type { DrawingShapeElement } from '../../types';
import { computed } from 'vue';
import { readDrawingTextElementContent } from './schema';

/**
 * 文本元素中间画布视图入参。
 */
interface Props {
  /** 当前文本元素 */
  element?: DrawingShapeElement;
}

const props = defineProps<Props>();
/** 当前文本正文内容。 */
const textContent = computed<string>(() => (props.element ? readDrawingTextElementContent(props.element) : ''));
</script>

<style lang="less" scoped>
.drawing-text-element-view {
  width: 100%;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
</style>
