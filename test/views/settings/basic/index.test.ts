/**
 * @file index.test.ts
 * @description 基础设置页 AI 工具权限管理测试。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
import { defineComponent, type PropType } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { mount, type VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SelectOption } from '@/components/BSelect/types';
import { useToolPermissionStore } from '@/stores/chat/toolPermission';
import BasicSettingsPage from '@/views/settings/basic/index.vue';

vi.mock('@/theme', () => ({
  getPresetList: (): Array<{ id: string; label: string }> => [{ id: 'default', label: '默认' }]
}));

/**
 * BSettingsPage 测试替身。
 */
const BSettingsPageStub = defineComponent({
  name: 'BSettingsPage',
  props: {
    title: { type: String, required: true }
  },
  template: '<main><h1>{{ title }}</h1><slot /></main>'
});

/**
 * BSettingsSection 测试替身。
 */
const BSettingsSectionStub = defineComponent({
  name: 'BSettingsSection',
  props: {
    title: { type: String, required: true }
  },
  template: '<section><h2>{{ title }}</h2><slot /></section>'
});

/**
 * BSelect 测试替身，保留 value/options/change 交互。
 */
const BSelectStub = defineComponent({
  name: 'BSelect',
  props: {
    value: { type: [String, Number], default: '' },
    options: { type: Array as PropType<SelectOption[]>, default: () => [] },
    width: { type: Number, default: undefined }
  },
  emits: ['change'],
  setup(_props, { emit }) {
    /**
     * 转发 select change 事件。
     * @param event - DOM change 事件
     */
    function handleChange(event: Event): void {
      emit('change', (event.target as HTMLSelectElement).value);
    }

    return { handleChange };
  },
  template: `
    <select v-bind="$attrs" class="b-select-stub" :value="value" @change="handleChange">
      <option v-for="option in options" :key="String(option.value)" :value="option.value">
        {{ option.label }}
      </option>
    </select>
  `
});

/**
 * BButton 测试替身，保留点击事件和 disabled 属性。
 */
const BButtonStub = defineComponent({
  name: 'BButton',
  props: {
    disabled: { type: Boolean, default: false }
  },
  emits: ['click'],
  template: '<button class="b-button-stub" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>'
});

/**
 * 挂载基础设置页。
 * @returns 组件 wrapper
 */
function mountBasicSettingsPage(): VueWrapper {
  return mount(BasicSettingsPage, {
    global: {
      stubs: {
        BSettingsPage: BSettingsPageStub,
        BSettingsSection: BSettingsSectionStub,
        BSelect: BSelectStub,
        BButton: BButtonStub
      }
    }
  });
}

describe('BasicSettingsPage tool permissions', (): void => {
  beforeEach((): void => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('renders persisted tool permission grants with readable labels', (): void => {
    const store = useToolPermissionStore();
    store.grantToolPermission('operate_webpage', 'always');
    store.grantToolPermission('update_settings', 'always');

    const wrapper = mountBasicSettingsPage();

    expect(wrapper.text()).toContain('AI 工具权限');
    expect(wrapper.text()).toContain('操作当前网页');
    expect(wrapper.text()).toContain('修改应用设置');
  });

  it('does not expose the global tool permission mode in basic settings', (): void => {
    const wrapper = mountBasicSettingsPage();

    expect(wrapper.text()).not.toContain('权限模式');
    expect(wrapper.find('[data-testid="tool-permission-mode-select"]').exists()).toBe(false);
  });

  it('revokes one persisted tool permission grant', async (): Promise<void> => {
    const store = useToolPermissionStore();
    store.grantToolPermission('operate_webpage', 'always');
    store.grantToolPermission('update_settings', 'always');
    const wrapper = mountBasicSettingsPage();

    await wrapper.find('[data-testid="revoke-tool-permission-operate_webpage"]').trigger('click');

    expect(store.alwaysToolPermissionGrants.operate_webpage).toBeUndefined();
    expect(store.alwaysToolPermissionGrants.update_settings).toBe(true);
    expect(wrapper.text()).not.toContain('操作当前网页');
  });

  it('clears all persisted tool permission grants', async (): Promise<void> => {
    const store = useToolPermissionStore();
    store.grantToolPermission('operate_webpage', 'always');
    store.grantToolPermission('update_settings', 'always');
    const wrapper = mountBasicSettingsPage();

    await wrapper.find('[data-testid="clear-always-tool-permissions"]').trigger('click');

    expect(store.alwaysToolPermissionGrants).toEqual({});
    expect(wrapper.text()).toContain('暂无始终允许的工具');
  });
});
