/**
 * @file web-address-bar.test.ts
 * @description 验证 WebView 地址栏更多操作菜单事件。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
import { defineComponent } from 'vue';
import { shallowMount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { DropdownOption } from '@/components/BDropdown/type';
import AddressBar from '@/views/webview/web/components/AddressBar.vue';

/**
 * BButton 测试替身，保留 tooltip 与 icon 这类可检索属性。
 */
const BButtonStub = defineComponent({
  name: 'BButton',
  props: {
    /** 按钮提示文案。 */
    tooltip: {
      type: String,
      default: ''
    },
    /** 按钮图标名。 */
    icon: {
      type: String,
      default: ''
    }
  },
  emits: ['click'],
  template: '<button type="button" :data-tooltip="tooltip" :data-icon="icon" @click="$emit(\'click\')"><slot /></button>'
});

/**
 * BDropdownMenu 测试替身，暴露菜单配置便于断言。
 */
const BDropdownMenuStub = defineComponent({
  name: 'BDropdownMenu',
  props: {
    /** 下拉菜单选项。 */
    options: {
      type: Array,
      required: true
    }
  },
  template: '<div class="b-dropdown-menu-stub"></div>'
});

/**
 * BDropdown 测试替身，直接渲染触发器与 overlay 插槽。
 */
const BDropdownStub = defineComponent({
  name: 'BDropdown',
  template: '<div class="b-dropdown-stub"><slot /><slot name="overlay" /></div>'
});

/**
 * 挂载 WebView 地址栏。
 * @param props - 需要覆盖的属性
 * @returns 地址栏包装器
 */
function mountAddressBar(props: { hasSelectedElement?: boolean; isScreenshotCapturing?: boolean } = {}): ReturnType<typeof shallowMount> {
  return shallowMount(AddressBar, {
    props: {
      url: 'https://example.com',
      ...props
    },
    global: {
      stubs: {
        BButton: BButtonStub,
        BDropdown: BDropdownStub,
        BDropdownMenu: BDropdownMenuStub,
        BIcon: true
      }
    }
  });
}

/**
 * 获取更多操作菜单配置。
 * @param wrapper - 地址栏包装器
 * @returns 更多操作菜单配置
 */
function getMoreActionOptions(wrapper: ReturnType<typeof shallowMount>): DropdownOption[] {
  return wrapper.findComponent({ name: 'BDropdownMenu' }).props('options') as DropdownOption[];
}

/**
 * 判断是否为选中元素截图菜单项。
 * @param option - 下拉菜单项
 * @returns 是否为选中元素截图菜单项
 */
function isSelectedElementScreenshotOption(option: DropdownOption): boolean {
  return option.type !== 'divider' && option.value === 'capture-selected-element';
}

describe('webview web AddressBar', () => {
  it('moves devtools action into the more action menu', (): void => {
    const wrapper = mountAddressBar();
    const debugButton = wrapper.find('.action-buttons [data-tooltip="打开开发者工具"]');
    const options = getMoreActionOptions(wrapper);
    const devToolsOption = options.find((option): boolean => option.type !== 'divider' && option.value === 'open-dev-tools');

    expect(debugButton.exists()).toBe(false);
    expect(devToolsOption).toMatchObject({
      type: 'item',
      label: '打开开发者工具',
      icon: 'lucide:bug'
    });

    if (!devToolsOption || devToolsOption.type === 'divider') {
      throw new Error('DevTools menu option should exist');
    }

    devToolsOption.onClick?.();
    expect(wrapper.emitted('openDevTools')).toHaveLength(1);
  });

  it('shows selected element screenshot action only when an element is selected', (): void => {
    const withoutSelectionWrapper = mountAddressBar();
    const withSelectionWrapper = mountAddressBar({ hasSelectedElement: true });
    const withoutSelectionOptions = getMoreActionOptions(withoutSelectionWrapper);
    const withSelectionOptions = getMoreActionOptions(withSelectionWrapper);
    const withoutSelectionScreenshotOption = withoutSelectionOptions.find((option): boolean => option.type !== 'divider' && option.value === 'screenshot');
    const withSelectionScreenshotOption = withSelectionOptions.find((option): boolean => option.type !== 'divider' && option.value === 'screenshot');

    if (!withoutSelectionScreenshotOption || withoutSelectionScreenshotOption.type === 'divider') {
      throw new Error('Screenshot menu option should exist');
    }
    if (!withSelectionScreenshotOption || withSelectionScreenshotOption.type === 'divider') {
      throw new Error('Screenshot menu option should exist');
    }

    expect(withoutSelectionScreenshotOption.children?.some(isSelectedElementScreenshotOption)).toBe(false);

    const selectedElementOption = withSelectionScreenshotOption.children?.find(isSelectedElementScreenshotOption);

    expect(selectedElementOption).toMatchObject({
      type: 'item',
      label: '选中元素',
      icon: 'lucide:scan'
    });

    if (!selectedElementOption || selectedElementOption.type === 'divider') {
      throw new Error('Selected element screenshot menu option should exist');
    }

    selectedElementOption.onClick?.();
    expect(withSelectionWrapper.emitted('captureSelectedElementScreenshot')).toHaveLength(1);
  });

  it('disables screenshot actions while a screenshot is running', (): void => {
    const wrapper = mountAddressBar({ hasSelectedElement: true, isScreenshotCapturing: true });
    const options = getMoreActionOptions(wrapper);
    const screenshotOption = options.find((option): boolean => option.type !== 'divider' && option.value === 'screenshot');

    if (!screenshotOption || screenshotOption.type === 'divider') {
      throw new Error('Screenshot menu option should exist');
    }

    const screenshotChildren = screenshotOption.children?.filter((option): boolean => option.type !== 'divider') ?? [];

    expect(screenshotOption.disabled).toBe(true);
    expect(screenshotChildren.every((option) => option.type !== 'divider' && option.disabled)).toBe(true);
  });
});
