/**
 * @file useWebviewDeviceMode.ts
 * @description 管理 `<webview>` 页面设备尺寸工具栏状态。
 */
import { computed, ref } from 'vue';
import { DEFAULT_WEBVIEW_DEVICE_PRESET, type WebviewDevicePreset, type WebviewDevicePresetKey, WEBVIEW_DEVICE_PRESETS } from '../constant';

export type { WebviewDevicePresetKey, WebviewDevicePreset };
export { DEFAULT_WEBVIEW_DEVICE_PRESET, WEBVIEW_DEVICE_PRESETS };

/**
 * 查找指定标识对应的设备预设。
 * @param key - 设备预设标识
 * @returns 设备预设
 */
function findDevicePreset(key: WebviewDevicePresetKey): WebviewDevicePreset {
  return WEBVIEW_DEVICE_PRESETS.find((preset) => preset.key === key) ?? WEBVIEW_DEVICE_PRESETS[0];
}

/**
 * 创建 WebView 设备模式控制器。
 * @returns 设备模式状态与控制方法
 */
export function useDeviceMode() {
  const isToolbarVisible = ref(false);
  const activePresetKey = ref<WebviewDevicePresetKey>(DEFAULT_WEBVIEW_DEVICE_PRESET.key);
  const touchSimulationEnabled = ref(false);
  const activePreset = computed<WebviewDevicePreset>(() => findDevicePreset(activePresetKey.value));

  /**
   * 切换设备工具栏显示状态。
   */
  function toggleToolbarVisible(): void {
    isToolbarVisible.value = !isToolbarVisible.value;
    touchSimulationEnabled.value = isToolbarVisible.value ? activePreset.value.touchByDefault : false;
  }

  /**
   * 选择指定设备预设。
   * @param key - 设备预设标识
   */
  function selectPreset(key: WebviewDevicePresetKey): void {
    const preset = findDevicePreset(key);
    activePresetKey.value = preset.key;
    touchSimulationEnabled.value = isToolbarVisible.value ? preset.touchByDefault : false;
  }

  /**
   * 切换到下一个设备预设。
   */
  function selectNextPreset(): void {
    const currentIndex = WEBVIEW_DEVICE_PRESETS.findIndex((preset) => preset.key === activePresetKey.value);
    const nextPreset = WEBVIEW_DEVICE_PRESETS[(currentIndex + 1) % WEBVIEW_DEVICE_PRESETS.length];
    selectPreset(nextPreset.key);
  }

  /**
   * 手动切换 touch 模拟。
   */
  function toggleTouchSimulation(): void {
    touchSimulationEnabled.value = !touchSimulationEnabled.value;
  }

  return {
    isToolbarVisible,
    activePreset,
    touchSimulationEnabled,
    toggleToolbarVisible,
    selectPreset,
    selectNextPreset,
    toggleTouchSimulation
  };
}

/**
 * 兼容旧测试与旧调用方的设备模式控制器命名。
 */
export const useWebviewDeviceMode = useDeviceMode;
