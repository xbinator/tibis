/**
 * @file index.test.ts
 * @description 验证 BDrawer 在布局容器缺失时能安全降级 Teleport 目标。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
import { defineComponent, nextTick } from 'vue';
import { mount, VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BDrawer from '@/components/BDrawer/index.vue';

/**
 * 测试用 ant-design-vue Drawer 替身。
 */
const ADrawerStub = defineComponent({
  name: 'ADrawer',
  props: {
    open: {
      type: Boolean,
      default: false
    }
  },
  template: '<section class="drawer-stub"><slot /></section>'
});

/**
 * 测试用图标替身。
 */
const BIconStub = defineComponent({
  name: 'BIcon',
  template: '<span class="icon-stub" />'
});

/**
 * 创建挂载后的 BDrawer。
 * @returns BDrawer 包装器
 */
function mountDrawer(): VueWrapper {
  return mount(BDrawer, {
    attachTo: document.body,
    props: {
      open: true,
      title: '测试抽屉'
    },
    slots: {
      default: '<span class="drawer-marker">抽屉内容</span>'
    },
    global: {
      stubs: {
        ADrawer: ADrawerStub,
        BIcon: BIconStub
      }
    }
  });
}

describe('BDrawer', (): void => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach((): void => {
    document.body.innerHTML = '';
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation((): void => undefined);
  });

  afterEach((): void => {
    consoleWarnSpy.mockRestore();
    document.body.innerHTML = '';
  });

  it('falls back to body when the default layout Teleport target is not ready', async (): Promise<void> => {
    const wrapper = mountDrawer();

    await nextTick();

    expect(document.body.querySelector('.drawer-marker')?.textContent).toBe('抽屉内容');
    expect(consoleWarnSpy).not.toHaveBeenCalledWith(expect.stringContaining('Failed to locate Teleport target'));

    wrapper.unmount();
  });

  it('moves to the default layout container once the container exists', async (): Promise<void> => {
    const layoutContent = document.createElement('main');
    layoutContent.className = 'b-layout__content';
    document.body.appendChild(layoutContent);

    const wrapper = mountDrawer();

    await nextTick();
    await nextTick();

    expect(layoutContent.querySelector('.drawer-marker')?.textContent).toBe('抽屉内容');

    wrapper.unmount();
  });
});
