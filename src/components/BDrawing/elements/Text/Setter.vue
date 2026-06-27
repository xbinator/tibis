<!--
  @file Setter.vue
  @description BDrawing 文本元素专属属性设置面板。
-->
<template>
  <BSectionBlock data-testid="drawing-text-setter" title="内容">
    <ATextarea v-model:value="textContent" :auto-size="{ minRows: 4, maxRows: 8 }" placeholder="输入文本内容" />
  </BSectionBlock>
</template>

<script setup lang="ts">
import type { DrawingElement } from '../../types';
import { computed } from 'vue';
import { readDrawingTextElementContent } from './schema';

/** 当前编辑的文本元素。 */
const element = defineModel<DrawingElement>('element', { required: true });
/** 当前文本正文内容，写入元素自定义元数据。 */
const textContent = computed<string>({
  /**
   * 读取文本正文内容。
   * @returns 文本正文
   */
  get: (): string => readDrawingTextElementContent(element.value),
  /**
   * 更新文本正文内容。
   * @param value - 新文本正文
   */
  set: (value: string): void => {
    element.value.metadata = {
      ...element.value.metadata,
      content: value
    };
  }
});
</script>
