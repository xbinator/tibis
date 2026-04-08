<template>
  <Teleport to="body">
    <div v-if="visible && variables.length > 0" ref="dropdownRef" class="variable-menu" :style="menuStyle" @mousedown.prevent>
      <div class="variable-menu-header">
        <Icon icon="lucide:variable" class="header-icon" />
        <span>选择变量</span>
      </div>
      <div class="variable-menu-list">
        <div
          v-for="(variable, index) in variables"
          :key="variable.value"
          class="variable-menu-item"
          :class="{ active: activeIndex === index }"
          @click="handleSelect(variable)"
          @mouseenter="handleMouseEnter(index)"
        >
          <div class="variable-item-main">
            <span class="variable-item-label">{{ variable.label }}</span>
            <span class="variable-item-value">{{ variable.value }}</span>
          </div>
          <div v-if="variable.description" class="variable-item-desc">
            {{ variable.description }}
          </div>
        </div>
      </div>
    </div>
    <div v-else-if="visible" ref="dropdownRef" class="variable-menu" :style="menuStyle" @mousedown.prevent>
      <div class="variable-menu-header">
        <Icon icon="lucide:variable" class="header-icon" />
        <span>选择变量</span>
      </div>
      <div class="variable-empty-state">没有匹配的变量</div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import type { Variable } from '../types';
import type { CSSProperties } from 'vue';
import { nextTick, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';

interface Props {
  visible: boolean;
  variables: Variable[];
  position: { top: number; left: number; bottom: number };
  activeIndex?: number;
}

const props = withDefaults(defineProps<Props>(), {
  activeIndex: 0
});

const emit = defineEmits<{
  (e: 'select', variable: Variable): void;
  (e: 'update:activeIndex', index: number): void;
}>();

const dropdownRef = ref<HTMLElement>();

const menuStyle = ref<CSSProperties>({});

watch(
  [() => props.visible, () => props.position],
  async () => {
    if (!props.visible) return;

    await nextTick();

    const styles: CSSProperties = {
      position: 'fixed',
      maxHeight: '400px',
      width: '300px',
      zIndex: 9999
    };

    const { innerHeight: viewportHeight, innerWidth: viewportWidth } = window;
    const dropdownHeight = dropdownRef.value?.clientHeight || 0;
    const dropdownWidth = dropdownRef.value?.clientWidth || 300;
    const gap = 8;

    const { top, left, bottom } = props.position;

    const expectedBottom = bottom + gap + dropdownHeight;
    const expectedRight = left + dropdownWidth;

    if (expectedBottom > viewportHeight) {
      styles.top = `${Math.max(gap, top - dropdownHeight - gap)}px`;
    } else {
      styles.top = `${bottom + gap}px`;
    }

    if (expectedRight > viewportWidth) {
      styles.left = `${Math.max(gap, viewportWidth - dropdownWidth - gap)}px`;
    } else {
      styles.left = `${Math.max(gap, left)}px`;
    }

    menuStyle.value = styles;
  },
  { immediate: true }
);

function handleSelect(variable: Variable): void {
  emit('select', variable);
}

function handleMouseEnter(index: number): void {
  emit('update:activeIndex', index);
}
</script>

<style scoped lang="less">
.variable-menu {
  position: fixed;
  z-index: 9999;
  min-width: 280px;
  max-width: 400px;
  padding: 8px 0;
  overflow: auto;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  box-shadow: 0 6px 16px rgb(0 0 0 / 8%), 0 3px 6px -4px rgb(0 0 0 / 12%), 0 9px 28px 8px rgb(0 0 0 / 5%);
}

.variable-menu-header {
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-secondary);

  .header-icon {
    width: 14px;
    height: 14px;
  }
}

.variable-menu-list {
  max-height: 300px;
  overflow-y: auto;
}

.variable-menu-item {
  padding: 8px 12px;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover,
  &.active {
    background: var(--bg-secondary);
  }
}

.variable-item-main {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.variable-item-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.variable-item-value {
  padding: 2px 6px;
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  font-size: 12px;
  color: var(--color-primary);
  background: var(--color-primary-bg);
  border-radius: 4px;
}

.variable-item-desc {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.variable-empty-state {
  padding: 16px 12px;
  font-size: 13px;
  color: var(--text-tertiary);
  text-align: center;
}
</style>
