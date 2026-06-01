/**
 * @file DeviceToolbar.test.ts
 * @description 验证 WebView 设备工具栏组件渲染与选择事件。
 * @vitest-environment jsdom
 */

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import DeviceToolbar from '@/views/webview/web/components/DeviceToolbar.vue';
import { WEBVIEW_DEVICE_PRESETS } from '@/views/webview/web/constant';

describe('DeviceToolbar', () => {
  it('shows the active preset label and emits selected preset keys', async () => {
    const wrapper = mount(DeviceToolbar, {
      props: {
        activePreset: WEBVIEW_DEVICE_PRESETS[0],
        presets: WEBVIEW_DEVICE_PRESETS
      },
      global: {
        stubs: {
          BDropdownButton: {
            template: '<button class="menu-stub" @click="$emit(\'change\', { value: \'iphone-14\' })"><slot /></button>',
            props: ['placement', 'options']
          },
          BIcon: {
            template: '<i />',
            props: ['icon']
          }
        }
      }
    });

    expect(wrapper.text()).toContain('iPhone SE 375x667');

    await wrapper.get('.menu-stub').trigger('click');

    expect(wrapper.emitted('selectPreset')).toEqual([['iphone-14']]);
  });
});
