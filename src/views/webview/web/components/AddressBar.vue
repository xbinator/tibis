<template>
  <div class="address-bar">
    <div class="nav-buttons">
      <BButton type="text" size="small" square :disabled="!canGoBack" tooltip="后退" icon="lucide:arrow-left" @click="emit('goBack')" />
      <BButton type="text" size="small" square :disabled="!canGoForward" tooltip="前进" icon="lucide:arrow-right" @click="emit('goForward')" />
      <BButton
        type="text"
        size="small"
        square
        :tooltip="isLoading ? '停止' : '刷新'"
        :icon="isLoading ? 'lucide:x' : 'lucide:refresh-cw'"
        @click="isLoading ? emit('stop') : emit('reload')"
      />
    </div>

    <div class="address-input">
      <input :value="url" class="address-input__control" type="text" spellcheck="false" @keydown.enter="handleEnter" />

      <BIcon icon="lucide:copy" class="address-input__icon" @click="handleCopy" />
    </div>

    <div class="action-buttons">
      <BButton
        type="text"
        size="small"
        square
        :tooltip="isDeviceToolbarVisible ? '隐藏设备工具栏' : '显示设备工具栏'"
        :icon="isDeviceToolbarVisible ? 'lucide:monitor-off' : 'lucide:monitor-smartphone'"
        @click="emit('toggleDeviceToolbar')"
      />
      <BButton
        :type="isElementSelecting ? 'secondary' : 'text'"
        size="small"
        square
        :tooltip="isElementSelecting ? '停止选择元素' : '选择页面元素'"
        :icon="isElementSelecting ? 'lucide:scan-line' : 'lucide:mouse-pointer-click'"
        @click="emit('selectElement')"
      />
      <BButton
        :type="isInspectorOpen ? 'secondary' : 'text'"
        size="small"
        square
        :tooltip="isInspectorOpen ? '关闭 CSS 查看器' : '打开 CSS 查看器'"
        :icon="'lucide:hash'"
        @click="emit('toggleInspector')"
      />
      <BButton type="text" size="small" square tooltip="在浏览器打开" placement="bottomRight" icon="lucide:external-link" @click="emit('openInBrowser')" />

      <BDropdown placement="bottomRight">
        <BButton type="text" size="small" square icon="lucide:more-vertical" />

        <template #overlay>
          <BDropdownMenu :options="moreActionOptions" :width="180" />
        </template>
      </BDropdown>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @file AddressBar.vue
 * @description Web WebView 地址栏组件（支持设备工具栏、元素选择、CSS 查看器）。
 */
import { computed } from 'vue';
import type { DropdownOption } from '@/components/BDropdown/type';
import { useClipboard } from '@/hooks/useClipboard';

const { clipboard } = useClipboard();

interface Props {
  /** 当前地址 */
  url: string;
  /** 是否允许后退 */
  canGoBack?: boolean;
  /** 是否允许前进 */
  canGoForward?: boolean;
  /** 是否正在加载 */
  isLoading?: boolean;
  /** 是否正在选择页面 DOM 元素 */
  isElementSelecting?: boolean;
  /** 设备工具栏是否可见 */
  isDeviceToolbarVisible?: boolean;
  /** CSS 查看器是否打开 */
  isInspectorOpen?: boolean | null;
}

const props = withDefaults(defineProps<Props>(), {
  canGoBack: false,
  canGoForward: false,
  isLoading: false,
  isElementSelecting: false,
  isDeviceToolbarVisible: false,
  isInspectorOpen: false
});

const emit = defineEmits<{
  goBack: [];
  goForward: [];
  reload: [];
  stop: [];
  openInBrowser: [];
  selectElement: [];
  toggleDeviceToolbar: [];
  toggleInspector: [];
  captureViewportScreenshot: [];
  captureFullPageScreenshot: [];
  clearCache: [];
  submitUrl: [value: string];
}>();

/**
 * 更多操作菜单项。
 */
const moreActionOptions = computed<DropdownOption[]>(() => [
  {
    type: 'item',
    value: 'capture-viewport',
    label: '截取当前视图',
    icon: 'lucide:camera',
    onClick: () => emit('captureViewportScreenshot')
  },
  {
    type: 'item',
    value: 'capture-full-page',
    label: '截取完整页面',
    icon: 'lucide:scroll-text',
    onClick: () => emit('captureFullPageScreenshot')
  },
  {
    type: 'divider'
  },
  {
    type: 'item',
    value: 'clear-cache',
    label: '清除缓存',
    icon: 'lucide:eraser',
    onClick: () => emit('clearCache')
  }
]);

/**
 * 提交地址栏中的 URL。
 * @param event - 键盘事件
 */
function handleEnter(event: KeyboardEvent): void {
  const { target } = event;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  emit('submitUrl', target.value);
}

/**
 * 复制当前 URL 到剪贴板。
 */
function handleCopy(): void {
  clipboard(props.url, { successMessage: '已复制地址' });
}
</script>

<style scoped lang="less">
.address-bar {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-primary);
}

.nav-buttons,
.action-buttons {
  display: flex;
  gap: 4px;
}

.address-input {
  display: flex;
  flex: 1;
  align-items: center;
  min-width: 0;
  height: 28px;
  padding: 0 10px;
  color: var(--text-primary);
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;

  &:focus-within {
    border-color: var(--color-primary);
  }
}

.address-input__control {
  width: 100%;
  min-width: 0;
  outline: none;
  background: transparent;
  border: none;
}

.address-input__icon {
  flex-shrink: 0;
  margin-left: 6px;
  color: var(--text-tertiary);
  cursor: pointer;
  opacity: 0;
  transition: color 0.2s, opacity 0.2s;

  &:hover {
    color: var(--text-secondary);
  }
}

.address-input:hover .address-input__icon {
  opacity: 1;
}
</style>
