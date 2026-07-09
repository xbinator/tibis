/**
 * @file icon.test.ts
 * @description 验证 BModelIcon 模型与服务商图标映射。
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from 'pinia';
import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import BModelIcon from '@/components/BModel/Icon.vue';
import { useSettingStore } from '@/stores/ui/setting';

/**
 * 挂载模型图标组件。
 * @param props - 组件属性
 * @returns 组件包装器
 */
function mountModelIcon(props: { model?: string; provider?: string }): VueWrapper {
  setActivePinia(createPinia());
  const settingStore = useSettingStore();
  settingStore.theme = 'light';

  return mount(BModelIcon, {
    props
  });
}

describe('BModelIcon', (): void => {
  it('uses the SenseNova provider color icon when only provider is supplied', (): void => {
    const wrapper = mountModelIcon({ provider: 'sensenova' });
    const image = wrapper.find('img');

    expect(image.exists()).toBe(true);
    expect(image.attributes('src')).toContain('sensenova-color.png');
    wrapper.unmount();
  });
});
