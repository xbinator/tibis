<template>
  <BDropdownButton :show-icon="false" :options="options" :min-width="220">
    <div>{{ title }}</div>

    <template #menu="{ record }">
      <span class="toolbar-menu-item-label">{{ (record as ToolbarOption).label }}</span>
      <span v-if="(record as ToolbarOption).shortcut" class="toolbar-menu-item-shortcut">
        {{ formatShortcut((record as ToolbarOption).shortcut as string) }}
      </span>
    </template>
  </BDropdownButton>
</template>

<script setup lang="ts">
import type { DropdownOptionItem, DropdownOptionDivider } from './BDropdown/type';
import { computed, watch } from 'vue';
import { useMagicKeys, whenever } from '@vueuse/core';
import { isMac } from '@/utils/is';

interface ToolbarOption extends DropdownOptionItem {
  shortcut?: string;
}

export interface Props {
  title?: string;
  //
  options?: (ToolbarOption | DropdownOptionDivider)[];
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  options: () => []
});

const isMacOS = computed(() => isMac());

function formatShortcut(shortcut: string): string {
  if (isMacOS.value) {
    return shortcut.replace(/Ctrl/g, '⌘').replace(/Shift/g, '⇧').replace(/Alt/g, '⌥');
  }
  return shortcut;
}

function getKeyName(shortcut: string): string {
  return shortcut.replace(/\+/g, '_').replace(/\s+/g, '').toLowerCase();
}

const keys = useMagicKeys();

function setupShortcuts() {
  const stopFns: (() => void)[] = [];

  props.options?.forEach((option) => {
    if (option.type === 'divider') return;

    if (!(option.shortcut && option.onClick && !option.disabled)) return;

    const keyCombo = getKeyName(option.shortcut);

    const stopFn = whenever(keys[keyCombo], () => option.onClick?.());
    stopFns.push(stopFn);

    if (isMacOS.value && option.shortcut.toLowerCase().includes('ctrl')) {
      const macKeyCombo = getKeyName(option.shortcut.replace(/ctrl/gi, 'meta'));

      const stopFnMac = whenever(keys[macKeyCombo], () => option.onClick?.());
      stopFns.push(stopFnMac);
    }
  });

  return () => stopFns.forEach((stop) => stop());
}

let cleanup: (() => void) | undefined;

watch(
  () => props.options,
  () => {
    cleanup?.();
    cleanup = setupShortcuts();
  },
  { immediate: true, deep: true }
);
</script>

<style lang="less" scoped>
.toolbar-menu-item-label {
  flex: 1;
}

.toolbar-menu-item-shortcut {
  margin-left: 24px;
  font-size: 12px;
  color: rgb(0 0 0 / 45%);
}
</style>
