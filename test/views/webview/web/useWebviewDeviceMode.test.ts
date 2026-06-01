/**
 * @file useWebviewDeviceMode.test.ts
 * @description 验证 WebView 设备工具栏状态切换逻辑。
 */

import { describe, expect, it } from 'vitest';
import { useWebviewDeviceMode } from '@/views/webview/web/hooks/useDeviceMode';

describe('useWebviewDeviceMode', () => {
  it('starts with the device toolbar hidden and touch simulation disabled', () => {
    const deviceMode = useWebviewDeviceMode();

    expect(deviceMode.isToolbarVisible.value).toBe(false);
    expect(deviceMode.activePreset.value.key).toBe('iphone-se');
    expect(deviceMode.touchSimulationEnabled.value).toBe(false);
  });

  it('applies the first device preset when the toolbar is opened', () => {
    const deviceMode = useWebviewDeviceMode();

    deviceMode.toggleToolbarVisible();

    expect(deviceMode.isToolbarVisible.value).toBe(true);
    expect(deviceMode.activePreset.value.key).toBe('iphone-se');
    expect(deviceMode.touchSimulationEnabled.value).toBe(true);

    deviceMode.toggleToolbarVisible();

    expect(deviceMode.isToolbarVisible.value).toBe(false);
    expect(deviceMode.touchSimulationEnabled.value).toBe(false);
  });

  it('cycles through concrete device presets and applies each touch default', () => {
    const deviceMode = useWebviewDeviceMode();

    deviceMode.toggleToolbarVisible();
    deviceMode.selectNextPreset();

    expect(deviceMode.activePreset.value.key).toBe('iphone-14');
    expect(deviceMode.touchSimulationEnabled.value).toBe(true);

    deviceMode.selectNextPreset();

    expect(deviceMode.activePreset.value.key).toBe('pixel-7');
    expect(deviceMode.touchSimulationEnabled.value).toBe(true);

    deviceMode.selectNextPreset();

    expect(deviceMode.activePreset.value.key).toBe('ipad-mini');
    expect(deviceMode.touchSimulationEnabled.value).toBe(true);

    deviceMode.selectNextPreset();

    expect(deviceMode.activePreset.value.key).toBe('desktop');
    expect(deviceMode.touchSimulationEnabled.value).toBe(false);
  });

  it('allows touch simulation to be toggled independently of the active preset', () => {
    const deviceMode = useWebviewDeviceMode();

    deviceMode.selectPreset('desktop');
    deviceMode.toggleTouchSimulation();

    expect(deviceMode.activePreset.value.key).toBe('desktop');
    expect(deviceMode.touchSimulationEnabled.value).toBe(true);
  });
});
