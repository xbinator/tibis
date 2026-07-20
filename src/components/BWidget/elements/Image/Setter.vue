<!--
  @file Setter.vue
  @description BWidget 图片元素专属属性设置面板。
-->
<template>
  <BSectionBlock title="图片" label-min-width="60">
    <BSectionItem label="地址">
      <BSmartInput v-model:value="imageSrc" :options="variableOptions" placeholder="图片地址" />
    </BSectionItem>
    <BSectionItem label="填充">
      <BSelect v-model:value="element.metadata.fit" :options="WIDGET_IMAGE_FIT_OPTIONS" />
    </BSectionItem>
    <BSectionItem label="替代文本" tooltip="属性 alt 属性，图片加载失败占位文字">
      <BSmartInput v-model:value="element.metadata.alt" placeholder="" allow-clear />
    </BSectionItem>
  </BSectionBlock>
</template>

<script setup lang="ts">
import type { WidgetImageElementMetadata } from './schema';
import type { WidgetElement } from '../../types';
import { useElementTemplate } from '../../hooks/useElementTemplate';
import { useElementVariables } from '../../hooks/useElementVariables';
import { WIDGET_IMAGE_FIT_OPTIONS } from './schema';

/** 当前编辑的图片元素。 */
const element = defineModel<WidgetElement<WidgetImageElementMetadata>>('element', { required: true });

/** 图片地址模板（编辑态，保留 {{ }} 语法）。 */
const imageSrc = useElementTemplate(element, 'src');
/** 当前可插入变量候选。 */
const { variableOptions } = useElementVariables((): WidgetElement<WidgetImageElementMetadata> => element.value);
</script>

<style lang="less" scoped></style>
