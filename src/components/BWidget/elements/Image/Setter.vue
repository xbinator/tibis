<!--
  @file Setter.vue
  @description BWidget 图片元素专属属性设置面板。
-->
<template>
  <BSectionBlock title="图片">
    <BSectionItem label="地址" direction="vertical">
      <AInput v-model:value="imageSrc" placeholder="URL 或变量插值" allow-clear />
      <div v-pre class="widget-image-setter__hint">支持 URL 或变量插值，例如 {{ avatar }}</div>
    </BSectionItem>
    <BSectionItem label="填充">
      <ASelect v-model:value="element.metadata.fit" :options="WIDGET_IMAGE_FIT_OPTIONS" />
    </BSectionItem>
    <BSectionItem label="替代文本" direction="vertical">
      <AInput v-model:value="element.metadata.alt" placeholder="无障碍描述（可选）" allow-clear />
    </BSectionItem>
  </BSectionBlock>
</template>

<script setup lang="ts">
import type { WidgetImageElementMetadata } from './schema';
import type { WidgetElement } from '../../types';
import { useElementTemplate } from '../../hooks/useElementTemplate';
import { WIDGET_IMAGE_FIT_OPTIONS } from './schema';

/** 当前编辑的图片元素。 */
const element = defineModel<WidgetElement<WidgetImageElementMetadata>>('element', { required: true });

/** 图片地址模板（编辑态，保留 {{ }} 语法）。 */
const imageSrc = useElementTemplate(element, 'src');
</script>

<style lang="less" scoped>
.widget-image-setter__hint {
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-tertiary);
}
</style>
