<!--
 * @file Item.vue
 * @description 区块字段行组件，封装"前缀 + 控件"的 flex 行布局，支持文字标签和图标前缀。
-->
<template>
  <label :class="name">
    <!-- 文字前缀 -->
    <div :class="bem('prefix')">
      <span v-if="label && !icon" :class="bem('label')">{{ label }}</span>
      <!-- 图标前缀 -->
      <BIcon v-if="icon" :icon="icon" :size="iconSize" :class="bem('icon')" />
    </div>
    <!-- 控件插槽 -->
    <slot></slot>
  </label>
</template>

<script setup lang="ts">
import type { BSectionItemProps as Props } from './types';
import { createNamespace } from '@/utils/namespace';

defineOptions({ name: 'BSectionItem' });

const [name, bem] = createNamespace('section-item');

withDefaults(defineProps<Props>(), {
  label: undefined,
  icon: undefined,
  iconSize: 16
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

.b-section-item__prefix {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
}

.b-section-item__label {
  flex-shrink: 0;
  color: var(--text-secondary);
}

.b-section-item__icon {
  flex-shrink: 0;
  color: var(--text-secondary);
}
</style>
