<template>
  <section :class="name">
    <div :class="bem('title')">{{ title }}</div>

    <div :class="[bem('content'), contentClass]">
      <slot></slot>
    </div>
  </section>
</template>

<script setup lang="ts">
import { createNamespace } from '@/utils/namespace';

/**
 * 设置分区容器 props。
 */
interface Props {
  /** 分区标题 */
  title: string;
  // 分区内容类名
  contentClass?: string;
}

withDefaults(defineProps<Props>(), {
  contentClass: ''
});

const [name, bem] = createNamespace('settings-section');
</script>

<style scoped lang="less">
.b-settings-section {
  max-width: 820px;
  margin: 0 auto;
  overflow: hidden;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 14px;
  box-shadow: var(--shadow-sm);

  + .b-settings-section {
    margin-top: 16px;
  }
}

.b-settings-section__title {
  display: flex;
  gap: 8px;
  align-items: center;
  height: 44px;
  padding: 0 16px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-primary);
}
</style>
