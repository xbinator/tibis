<template>
  <div class="webview-device-toolbar">
    <BDropdownButton placement="bottomLeft" :options="devicePresetOptions" @change="handleDevicePresetChange">
      <div>
        <BIcon icon="lucide:smartphone" />
        {{ activeDeviceLabel }}
      </div>

      <template #menu="{ record }">
        {{ record.label }}
      </template>
    </BDropdownButton>

    <!-- 设备尺寸信息 -->
    <span class="device-size-info">{{ activePreset.width }} x {{ activePreset.height }}</span>
  </div>
</template>

<script setup lang="ts">
/**
 * @file DeviceToolbar.vue
 * @description WebView 设备尺寸选择工具栏。
 */
import { computed } from 'vue';
import type { DropdownOptionItem } from '@/components/BDropdown/type';
import { type WebviewDevicePreset, type WebviewDevicePresetKey, WEBVIEW_DEVICE_PRESETS } from '../constant';

interface Props {
  /** 当前选中的设备预设 */
  activePreset: WebviewDevicePreset;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  selectPreset: [presetKey: WebviewDevicePresetKey];
}>();

const activeDeviceLabel = computed(() => {
  const preset = props.activePreset;
  return preset.label;
});

const devicePresetOptions = computed<DropdownOptionItem[]>(() =>
  WEBVIEW_DEVICE_PRESETS.map((preset) => ({
    value: preset.key,
    label: preset.label,
    checked: preset.key === props.activePreset.key
  }))
);

/**
 * 处理设备尺寸下拉菜单选择。
 * @param record - 当前选择的设备预设菜单项
 */
function handleDevicePresetChange(record: DropdownOptionItem): void {
  emit('selectPreset', record.value as WebviewDevicePresetKey);
}
</script>

<style scoped>
.webview-device-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: flex-start;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-secondary);
}

.device-size-info {
  font-size: 12px;
  color: var(--text-tertiary);
}
</style>
