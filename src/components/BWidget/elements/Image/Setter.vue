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
      <ASelect v-model:value="fit" :options="WIDGET_IMAGE_FIT_OPTIONS" />
    </BSectionItem>
    <BSectionItem label="替代文本" direction="vertical">
      <AInput v-model:value="altText" placeholder="无障碍描述（可选）" allow-clear />
    </BSectionItem>
  </BSectionBlock>
</template>

<script setup lang="ts">
import type { WidgetImageFit } from './schema';
import type { WidgetElement } from '../../types';
import { computed } from 'vue';
import { useElementTemplate } from '../../hooks/useElementTemplate';
import { WIDGET_IMAGE_DEFAULT_FIT, WIDGET_IMAGE_FIT_OPTIONS, isWidgetImageFit } from './schema';

/** 当前编辑的图片元素。 */
const element = defineModel<WidgetElement>('element', { required: true });

/** 图片地址模板（编辑态，保留 {{ }} 语法）。 */
const imageSrc = useElementTemplate(element, 'src');
/** 替代文本模板（编辑态，保留 {{ }} 语法）。 */
const altText = useElementTemplate(element, 'alt');

/**
 * 图片填充模式；非法值归一化为默认值。
 * 读写均经 isWidgetImageFit 校验，避免非法值落库。
 */
const fit = computed<WidgetImageFit>({
  /**
   * 读取并归一化填充模式。
   * @returns 合法填充模式，未设置或非法时返回默认值
   */
  get: (): WidgetImageFit => (isWidgetImageFit(element.value.metadata.fit) ? element.value.metadata.fit : WIDGET_IMAGE_DEFAULT_FIT),
  /**
   * 写入填充模式。
   * @param value - 填充模式新值
   */
  set: (value: WidgetImageFit): void => {
    element.value.metadata = { ...element.value.metadata, fit: value };
  }
});
</script>

<style lang="less" scoped>
.widget-image-setter__hint {
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-tertiary);
}
</style>
