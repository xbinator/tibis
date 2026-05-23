<template>
  <div :class="bem()">
    <div :class="bem('header')">
      <div :class="bem('title')">
        <slot name="title">{{ title }}</slot>
      </div>

      <div :class="bem('header-extra')">
        <slot name="headerExtra"></slot>
      </div>
    </div>
    <div :class="bem('body')">
      <slot></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { createNamespace } from '@/utils/namespace';

/**
 * 设置页面布局 props。
 */
interface Props {
  /** 页面标题 */
  title?: string;
}

withDefaults(defineProps<Props>(), {
  title: ''
});

const [, bem] = createNamespace('settings-page');
</script>

<style scoped lang="less">
.b-settings-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-primary);
  border-radius: 8px;
}

.b-settings-page__header {
  display: flex;
  flex-shrink: 0;
  gap: 6px;
  align-items: center;
  height: 52px;
  padding: 0 20px;
  border-bottom: 1px solid var(--border-primary);
}

.b-settings-page__title {
  display: flex;
  align-items: center;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.b-settings-page__header-extra {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-left: auto;
}

.b-settings-page__body {
  flex: 1;
  width: 100%;
  padding: 20px;
  overflow: auto;
}
</style>
