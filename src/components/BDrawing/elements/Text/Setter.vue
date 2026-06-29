<!--
  @file Setter.vue
  @description BDrawing 文本元素专属属性设置面板。
-->
<template>
  <BSectionBlock data-testid="drawing-text-setter" title="内容">
    <BPromptEditor v-model:value="textContent" :options="variableOptions" :max-height="180" />
  </BSectionBlock>
</template>

<script setup lang="ts">
import type { DrawingData, DrawingElement } from '../../types';
import { useElementTemplate } from '../../hooks/useElementTemplate';
import { useElementVariables } from '../../hooks/useElementVariables';

/**
 * 文本元素 Setter 入参。
 */
interface Props {
  /** 当前画图数据，用于生成变量候选 */
  drawingData?: DrawingData;
}

const props = defineProps<Props>();
/** 当前编辑的文本元素。 */
const element = defineModel<DrawingElement>('element', { required: true });

/** 当前文本正文内容，写回元素自定义元数据。 */
const textContent = useElementTemplate(element, 'content');
/** 当前可插入变量候选。 */
const { variableOptions } = useElementVariables((): DrawingData | undefined => props.drawingData);
</script>
