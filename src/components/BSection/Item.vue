<!--
 * @file Item.vue
 * @description 区块字段行组件，封装"前缀 + 控件"的 flex 行布局，支持文字标签和图标前缀。
-->
<template>
  <div :class="bem({ vertical: direction === 'vertical' })">
    <!-- 文字前缀 -->
    <div :class="bem('label')" :style="labelStyle">
      <template v-if="label && !icon">{{ label }}</template>
      <!-- 图标前缀 -->
      <BIcon v-if="icon" :icon="icon" :size="iconSize" :class="bem('icon')" />
    </div>
    <!-- 控件插槽 -->
    <slot></slot>
  </div>
</template>

<script setup lang="ts">
import type { BSectionItemProps as Props } from './types';
import { computed, type CSSProperties } from 'vue';
import { addCssUnit } from '@/utils/css';
import { createNamespace } from '@/utils/namespace';
import { useSectionContext } from './context';

defineOptions({ name: 'BSectionItem' });

const [, bem] = createNamespace('section-item');

const props = withDefaults(defineProps<Props>(), {
  label: undefined,
  icon: undefined,
  iconSize: 16,
  labelMinWidth: undefined,
  direction: 'horizontal'
});

/** 最近 BSectionBlock 提供的共享上下文。 */
const sectionContext = useSectionContext();

/** 标签区域的内联样式。 */
const labelStyle = computed<CSSProperties>(() => {
  const minWidth = addCssUnit(props.labelMinWidth ?? sectionContext.labelMinWidth.value);

  if (minWidth === undefined) return {};

  return { minWidth };
});
</script>

<style lang="less">
.b-section-item {
  display: flex;
  gap: 8px;
  align-items: center;
  min-width: 0;

  /* 控件填满剩余宽度 */
  .ant-input-number,
  .ant-select,
  .ant-input {
    width: 100%;
  }
}

.b-section-item__label {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  min-width: 18px;
  font-size: 12px;
  color: var(--text-secondary);
}

/* 垂直布局：前缀与控件纵向排列 */
.b-section-item--vertical {
  flex-direction: column;
  align-items: stretch;

  .b-section-item__label {
    justify-content: flex-start;
    min-width: 0;
  }
}
</style>
