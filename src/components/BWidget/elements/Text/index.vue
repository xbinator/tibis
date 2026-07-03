<!--
  @file index.vue
  @description BWidget 文本元素中间Widget视图。
-->
<template>
  <div class="widget-text-element-view">
    <div :style="viewStyle">{{ textContent }}</div>
  </div>
</template>

<script setup lang="ts">
import type { WidgetTextElementMetadata } from './schema';
import type { WidgetShapeElement } from '../../types';
import type { StyleValue } from 'vue';
import { computed, toRef } from 'vue';
import { useElementContent } from '../../hooks/useElementContent';

/**
 * 文本元素中间Widget视图入参。
 */
interface Props {
  /** 当前文本元素 */
  element?: WidgetShapeElement<WidgetTextElementMetadata>;
}

const props = defineProps<Props>();
/** 当前文本正文内容。 */
const textContent = useElementContent(toRef(props, 'element'), 'content');

/**
 * 计算 line-clamp 内联样式。
 * - 未设置 maxLines 时返回空对象，保留原始 pre-wrap 布局
 * - 设置 maxLines 时切换为 -webkit-box 并按行数截断（手动换行也计入配额）
 * @returns Vue 内联样式对象
 */
const viewStyle = computed<StyleValue>((): StyleValue => {
  const maxLines = props.element?.metadata.maxLines;
  if (maxLines === undefined) return {};

  return {
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: String(maxLines),
    overflow: 'hidden'
  };
});
</script>

<style lang="less" scoped>
.widget-text-element-view {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 13px;
  line-height: 1.35;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  background: transparent;
  border-color: transparent;
}
</style>
