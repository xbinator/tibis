<template>
  <div class="sidebar-header">
    <BButton square type="text" @click="emit('toggle')">
      <Icon :icon="collapsed ? 'lucide:panel-left-open' : 'lucide:panel-left-close'" width="15" height="15" />
    </BButton>
    <AInput
      v-show="!collapsed"
      :value="modelValue"
      class="sidebar-search"
      placeholder="搜索模型平台"
      :bordered="false"
      allow-clear
      @update:value="emit('update:modelValue', $event ?? '')"
    >
      <template #prefix>
        <Icon icon="lucide:search" width="13" height="13" />
      </template>
    </AInput>
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue';

interface Props {
  collapsed: boolean;
  modelValue: string;
}

defineProps<Props>();

const emit = defineEmits<{
  (e: 'toggle'): void;
  (e: 'update:modelValue', value: string): void;
}>();
</script>

<style scoped lang="less">
.sidebar-header {
  display: flex;
  gap: 6px;
  align-items: center;
  height: 32px;
  margin-bottom: 12px;
}

.sidebar-search {
  flex: 1;
  min-width: 0;
  background: var(--bg-secondary);
  border: 1px solid transparent;
  border-radius: 6px;
  transition: border-color 0.15s;

  &:focus-within,
  &.ant-input-affix-wrapper-focused {
    border-color: var(--color-primary);
  }

  :deep(.ant-input) {
    font-size: 12px;
    background: transparent;
  }

  :deep(.ant-input-prefix) {
    color: var(--text-tertiary);
  }
}
</style>
