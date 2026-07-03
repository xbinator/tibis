<!--
  @file Setter.vue
  @description BWidget 文本元素专属属性设置面板。
-->
<template>
  <BSectionBlock title="内容">
    <BPromptEditor v-model:value="textContent" :options="variableOptions" :max-height="180" />
  </BSectionBlock>
  <BSectionBlock title="显示">
    <BSectionItem label="最大行数">
      <AInputNumber v-model:value="maxLines" :min="1" :max="99" :precision="0" allow-clear placeholder="不限" />
    </BSectionItem>
    <div class="widget-text-setter__hint">超出指定行数将截断显示，手动换行也计入配额。留空表示不限制。</div>
  </BSectionBlock>
</template>

<script setup lang="ts">
import type { WidgetData, WidgetElement } from '../../types';
import { computed } from 'vue';
import { useElementTemplate } from '../../hooks/useElementTemplate';
import { useElementVariables } from '../../hooks/useElementVariables';
import { readTextElementMaxLines } from '../../utils/widgetTextMetrics';

/**
 * 文本元素 Setter 入参。
 */
interface Props {
  /** 当前 Widget 数据，用于生成变量候选 */
  dataItem?: WidgetData;
}

const props = defineProps<Props>();
/** 当前编辑的文本元素。 */
const element = defineModel<WidgetElement>('element', { required: true });

/** 当前文本正文内容，写回元素自定义元数据。 */
const textContent = useElementTemplate(element, 'content');
/** 当前可插入变量候选。 */
const { variableOptions } = useElementVariables(
  (): WidgetData | undefined => props.dataItem,
  (): WidgetElement => element.value
);

/**
 * 最大显示行数；留空（null/undefined）表示不限制。
 * 读写均通过 readTextElementMaxLines 归一化，避免非法值落库。
 */
const maxLines = computed<number | undefined>({
  /**
   * 读取并归一化最大行数。
   * @returns 最大行数，未设置或非法时返回 undefined
   */
  get: (): number | undefined => readTextElementMaxLines(element.value.metadata),
  /**
   * 写入最大行数；清空（null/undefined）或非正数时移除字段以保持元数据干净。
   * @param value - 最大行数新值，AInputNumber allow-clear 清空时传入 null
   */
  set: (value: number | null | undefined): void => {
    const nextMetadata = { ...element.value.metadata };
    if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) {
      delete nextMetadata.maxLines;
    } else {
      nextMetadata.maxLines = Math.floor(value);
    }
    element.value.metadata = nextMetadata;
  }
});
</script>

<style lang="less" scoped>
.widget-text-setter__hint {
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-tertiary);
}
</style>
