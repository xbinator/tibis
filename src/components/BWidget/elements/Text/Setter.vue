<!--
  @file Setter.vue
  @description BWidget 文本元素专属属性设置面板。
-->
<template>
  <BSectionBlock title="内容" tips="支持按此格式书写变量：{{USER_NAME}}">
    <BTextEditor v-model:value="textContent" :options="variableOptions" :max-height="180" />
  </BSectionBlock>
  <BSectionBlock title="显示" label-min-width="60">
    <BSectionItem label="最大行数" tooltip="超出指定行数将截断显示，手动换行也计入配额。留空表示不限制。">
      <BInputNumber v-model:value="element.metadata.maxLines" :min="1" :max="99" :precision="0" placeholder="不限" />
    </BSectionItem>
  </BSectionBlock>
</template>

<script setup lang="ts">
import type { WidgetTextElementMetadata } from './schema';
import type { WidgetElement } from '../../types';
import { useElementTemplate } from '../../hooks/useElementTemplate';
import { useElementVariables } from '../../hooks/useElementVariables';

/** 当前编辑的文本元素。 */
const element = defineModel<WidgetElement<WidgetTextElementMetadata>>('element', { required: true });

/** 当前文本正文内容，写回元素自定义元数据。 */
const textContent = useElementTemplate(element, 'content');
/** 当前可插入变量候选。 */
const { variableOptions } = useElementVariables((): WidgetElement<WidgetTextElementMetadata> => element.value);
</script>
