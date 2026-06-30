<!--
  @file index.vue
  @description BWidget 文本元素中间Widget视图。
-->
<template>
  <span class="widget-text-element-view">{{ textContent }}</span>
</template>

<script setup lang="ts">
import type { WidgetShapeElement } from '../../types';
import { toRef } from 'vue';
import { useElementContent } from '../../hooks/useElementContent';

/**
 * 文本元素中间Widget视图入参。
 */
interface Props {
  /** 当前文本元素 */
  element?: WidgetShapeElement;
}

const props = defineProps<Props>();
/** 当前文本正文内容。 */
const textContent = useElementContent(toRef(props, 'element'), 'content');
</script>

<style lang="less" scoped>
.widget-text-element-view {
  width: 100%;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
</style>
