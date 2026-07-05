<!--
  @file DesignSetter.vue
  @description Widget页面右侧设计设置面板，用于编辑选中元素的基础、文字、布局和填充属性。
-->
<template>
  <div>
    <!-- 文字 -->
    <BSectionBlock title="文字">
      <div :class="$style.fieldGrid">
        <BSectionItem icon="lucide:type" tips="大小">
          <BInputNumber v-model:value="dataItem.style.fontSize" placeholder="字号" />
        </BSectionItem>
        <BSectionItem icon="lucide:bold" tips="字重">
          <BSelect v-model:value="dataItem.style.fontWeight" default-value="400" placeholder="字重" :options="fontWeightOptions" />
        </BSectionItem>
      </div>

      <div :class="$style.fieldGrid">
        <BSectionItem icon="mdi:format-line-height" tips="行高">
          <BInputNumber v-model:value="dataItem.style.lineHeight" :min="0" :step="0.1" :decimal-precision="2" placeholder="行高" />
        </BSectionItem>
        <BSectionItem icon="mdi:format-italic" tips="样式">
          <BSelect v-model:value="dataItem.style.fontStyle" default-value="normal" placeholder="斜体" :options="fontStyleOptions" />
        </BSectionItem>
      </div>

      <BSectionItem icon="lucide:a-large-small" tips="字体颜色">
        <BColorPicker v-model:value="dataItem.style.color" />
      </BSectionItem>
      <!-- 文字对齐 -->
      <BSectionItem icon="lucide:chart-no-axes-gantt" tips="对齐">
        <BSegmented v-model:value="dataItem.style.textAlign" block :options="textAlignOptions">
          <template #label="{ record }">
            <BIcon :icon="textAlignIconMap[record.value as keyof typeof textAlignIconMap]" :size="16" />
          </template>
        </BSegmented>
      </BSectionItem>
      <!-- 文字修饰 -->
      <BSectionItem icon="lucide:underline" tips="修饰">
        <BSegmented v-model:value="dataItem.style.textDecoration" block :options="textDecorationOptions" />
      </BSectionItem>
    </BSectionBlock>

    <!-- 布局 -->
    <BSectionBlock title="布局">
      <BSectionItem label="锁" label-align="center" content-align="right">
        <BButton
          :icon="isGeometryLocked ? 'lucide:lock' : 'lucide:unlock'"
          square
          size="small"
          :type="isGeometryLocked ? 'secondary' : 'outline'"
          @click="toggleGeometryLocked"
        />
      </BSectionItem>

      <div :class="$style.fieldGrid">
        <BSectionItem label="X" label-align="center">
          <BInputNumber v-model:value="dataItem.position.x" :disabled="isGeometryLocked" :default-value="0" :decimal-precision="2" />
        </BSectionItem>
        <BSectionItem label="Y" label-align="center">
          <BInputNumber v-model:value="dataItem.position.y" :disabled="isGeometryLocked" :default-value="0" :decimal-precision="2" />
        </BSectionItem>
        <BSectionItem label="宽" label-align="center">
          <BInputNumber
            v-model:value="dataItem.size.width"
            :disabled="isGeometryLocked"
            :min="WIDGET_MIN_ELEMENT_SIZE.width"
            :default-value="WIDGET_MIN_ELEMENT_SIZE.width"
            :decimal-precision="2"
          />
        </BSectionItem>
        <BSectionItem label="高" label-align="center">
          <BInputNumber
            v-model:value="dataItem.size.height"
            :disabled="isGeometryLocked"
            :min="WIDGET_MIN_ELEMENT_SIZE.height"
            :default-value="WIDGET_MIN_ELEMENT_SIZE.height"
            :decimal-precision="2"
          />
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
    <BSectionBlock title="边框">
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
import { computed, useCssModule } from 'vue';
import { WIDGET_MIN_ELEMENT_SIZE } from '@/components/BWidget/constants/board';
import type { WidgetBorderStyle, WidgetElement, WidgetElementStyle, WidgetFontStyle, WidgetTextDecoration } from '@/components/BWidget/types';
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
/** 当前元素是否锁定位置和尺寸。 */
const isGeometryLocked = computed<boolean>(() => dataItem.value.locked === true);

/** 字重选项。 */
const fontWeightOptions = [
  { value: 400, label: '400' },
  { value: 500, label: '500' },
  { value: 600, label: '600' },
  { value: 700, label: '700' }
];

/** 文字斜体选项。 */
const fontStyleOptions: Array<{ value: WidgetFontStyle; label: string }> = [
  { value: 'normal', label: '正常' },
  { value: 'italic', label: '斜体' }
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

/** 文字修饰选项。 */
const textDecorationOptions: Array<{ value: WidgetTextDecoration; label: string }> = [
  { value: 'none', label: '无' },
  { value: 'underline', label: '下划线' },
  { value: 'line-through', label: '删除线' }
];

/** 边框线形选项。 */
const borderStyleOptions: Array<{ value: WidgetBorderStyle; label: string }> = [
  { value: 'none', label: '无' },
  { value: 'solid', label: '实线' },
  { value: 'dashed', label: '虚线' },
  { value: 'dotted', label: '点线' }
];

/**
 * 切换当前元素的位置和尺寸锁定状态。
 */
function toggleGeometryLocked(): void {
  dataItem.value.locked = !isGeometryLocked.value;
}
</script>

<style module lang="less">
.fieldGrid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
</style>
