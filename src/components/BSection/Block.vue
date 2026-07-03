<!--
 * @file Block.vue
 * @description 区块组件，封装统一的 section 标题 + 内容插槽结构，支持折叠/展开和 header 右侧额外区域。
-->
<template>
  <section :class="bem({ collapsed: isCollapsed, collapsible })">
    <header :class="bem('header')" @click="handleHeaderClick">
      <div :class="bem('title-group')">
        <div :class="bem('title')">{{ title }}</div>
        <div v-if="$slots.help" :class="bem('help')" @click.stop>
          <slot name="help"></slot>
        </div>
      </div>
      <div v-if="collapsible || $slots.extra" :class="bem('extra')">
        <slot name="extra"></slot>
        <BIcon v-if="collapsible" icon="lucide:chevron-right" :size="14" :class="bem('arrow')" />
      </div>
    </header>

    <div v-show="!isCollapsed" :class="bem('content')">
      <slot></slot>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { BSectionBlockProps as Props } from './types';
import { computed, ref } from 'vue';
import { createNamespace } from '@/utils/namespace';
import { provideSectionContext } from './context';

defineOptions({ name: 'BSectionBlock' });

const [, bem] = createNamespace('section-block');

const props = withDefaults(defineProps<Props>(), {
  collapsible: false,
  defaultCollapsed: false,
  labelMinWidth: undefined
});

/** 当前折叠状态。 */
const isCollapsed = ref(props.defaultCollapsed);

/** 向字段行下发的标签最小宽度配置。 */
const providedLabelMinWidth = computed(() => props.labelMinWidth);

provideSectionContext({
  labelMinWidth: providedLabelMinWidth
});

/**
 * 点击 header 切换折叠状态。
 */
function handleHeaderClick(): void {
  if (props.collapsible) {
    isCollapsed.value = !isCollapsed.value;
  }
}
</script>

<style lang="less">
.b-section-block {
  padding-bottom: 12px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--border-primary);

  &:last-child {
    padding-bottom: 0;
    margin-bottom: 0;
    border-bottom: 0;
  }
}

.b-section-block__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 28px;
  margin-bottom: 8px;
}

.b-section-block--collapsed .b-section-block__header {
  margin-bottom: 0;
}

.b-section-block__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.b-section-block__title-group {
  display: flex;
  gap: 6px;
  align-items: center;
  min-width: 0;
}

.b-section-block__help {
  display: inline-flex;
  align-items: center;
  color: var(--text-tertiary);
}

.b-section-block__extra {
  display: flex;
  gap: 4px;
  align-items: center;
  color: var(--text-secondary);
}

.b-section-block__arrow {
  transition: transform 0.2s ease;
}

.b-section-block--collapsed .b-section-block__arrow {
  transform: rotate(90deg);
}

.b-section-block__content {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.b-section-block--collapsible .b-section-block__header {
  cursor: pointer;
}
</style>
