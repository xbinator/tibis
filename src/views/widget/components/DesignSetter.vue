<!--
  @file DesignSetter.vue
  @description Widget页面右侧设计设置面板，用于编辑选中元素的基础、文字、布局和填充属性。
-->
<template>
  <div>
    <!-- 基础 -->
    <BSectionBlock title="基础">
      <BSectionItem label="名称">
        <AInput v-model:value="dataItem.title" />
      </BSectionItem>
    </BSectionBlock>

    <!-- 文字 -->
    <BSectionBlock title="文字">
      <div :class="$style.fieldGrid">
        <BSectionItem icon="lucide:type">
          <AInputNumber v-model:value="dataItem.style.fontSize" placeholder="字号" :controls="false" />
        </BSectionItem>
        <BSectionItem icon="lucide:bold">
          <BSelect v-model:value="dataItem.style.fontWeight" placeholder="字重" :options="fontWeightOptions" />
        </BSectionItem>
      </div>

      <BSectionItem icon="lucide:a-large-small">
        <BColorPicker v-model:value="dataItem.style.color">
          <AInput v-model:value="dataItem.style.color" placeholder="字体颜色" />
        </BColorPicker>
      </BSectionItem>
      <!-- 文字对齐 -->
      <BSegmented v-model:value="dataItem.style.textAlign" block :options="textAlignOptions">
        <template #label="{ record }">
          <BIcon :icon="textAlignIconMap[record.value as keyof typeof textAlignIconMap]" :size="16" />
        </template>
      </BSegmented>
    </BSectionBlock>

    <!-- 布局 -->
    <BSectionBlock title="布局">
      <div :class="$style.fieldGrid">
        <BSectionItem label="X">
          <AInputNumber v-model:value="dataItem.position.x" :controls="false" />
        </BSectionItem>
        <BSectionItem label="Y">
          <AInputNumber v-model:value="dataItem.position.y" :controls="false" />
        </BSectionItem>
        <BSectionItem label="宽">
          <AInputNumber v-model:value="dataItem.size.width" :controls="false" />
        </BSectionItem>
        <BSectionItem label="高">
          <AInputNumber v-model:value="dataItem.size.height" :controls="false" />
        </BSectionItem>
      </div>

      <ControlPanel v-model:value="dataItem.style.padding" label="内边距" mode="sides" />
    </BSectionBlock>

    <!-- 填充 -->
    <BSectionBlock title="填充">
      <BSectionItem icon="lucide:paint-bucket">
        <BColorPicker v-model:value="dataItem.style.backgroundColor" />
      </BSectionItem>
    </BSectionBlock>

    <!-- 边框 -->
    <BSectionBlock title="描边">
      <BSectionItem label="线形">
        <BSelect v-model:value="dataItem.style.borderStyle" placeholder="线形" :options="borderStyleOptions" />
      </BSectionItem>

      <ControlPanel v-model:value="dataItem.style.borderWidth" label="宽度" mode="sides" />

      <BSectionItem label="颜色">
        <BColorPicker v-model:value="dataItem.style.borderColor" />
      </BSectionItem>

      <ControlPanel v-model:value="dataItem.style.borderRadius" label="圆角" mode="corners" />
    </BSectionBlock>
  </div>
</template>

<script setup lang="ts">
import { useCssModule } from 'vue';
import { Input as AInput, InputNumber as AInputNumber } from 'ant-design-vue';
import type { WidgetBorderStyle, WidgetElement, WidgetElementStyle } from '@/components/BWidget/types';
import ControlPanel from './DesignSetter/ControlPanel.vue';

const $style = useCssModule();

/**
 * 可直接编辑样式字段的Widget元素。
 */
type EditableWidgetElement = WidgetElement & {
  /** 元素样式 */
  style: WidgetElementStyle;
};

const dataItem = defineModel<EditableWidgetElement>('element', { default: () => ({}) });

/** 字重选项。 */
const fontWeightOptions = [
  { value: 400, label: '400' },
  { value: 500, label: '500' },
  { value: 600, label: '600' },
  { value: 700, label: '700' }
];

/** 文本对齐选项。 */
const textAlignOptions = [
  { value: 'left', label: '左对齐' },
  { value: 'center', label: '居中' },
  { value: 'right', label: '右对齐' },
  { value: 'justify', label: '两端对齐' }
];

/** 文本对齐选项值到图标的映射。 */
const textAlignIconMap: Record<string, string> = {
  left: 'lucide:align-left',
  center: 'lucide:align-center',
  right: 'lucide:align-right',
  justify: 'lucide:align-justify'
};

/** 边框线形选项。 */
const borderStyleOptions: Array<{ value: WidgetBorderStyle; label: string }> = [
  { value: 'none', label: '无' },
  { value: 'solid', label: '实线' },
  { value: 'dashed', label: '虚线' },
  { value: 'dotted', label: '点线' }
];
</script>

<style module lang="less">
.fieldGrid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
</style>
