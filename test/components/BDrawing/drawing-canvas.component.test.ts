/**
 * @file drawing-canvas.component.test.ts
 * @description 验证 BDrawing SVG 画布和基础工具栏交互。
 * @vitest-environment jsdom
 */
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import BDrawing from '@/components/BDrawing/index.vue';

describe('BDrawing', (): void => {
  it('renders an empty drawing workbench', (): void => {
    const wrapper = mount(BDrawing);

    expect(wrapper.find('.b-drawing').exists()).toBe(true);
    expect(wrapper.find('[data-testid="drawing-canvas"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('开始画图');
  });

  it('selects the process tool and places a node on canvas click', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await wrapper.find('[data-testid="drawing-add-process"]').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');

    expect(wrapper.findAll('[data-testid="drawing-node"]')).toHaveLength(1);
    expect(wrapper.text()).toContain('流程节点');
  });

  it('keeps the process tool active for repeated canvas placement', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await wrapper.find('[data-testid="drawing-add-process"]').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');

    expect(wrapper.findAll('[data-testid="drawing-node"]')).toHaveLength(2);
    expect(wrapper.findAll('[data-testid="drawing-edge"]')).toHaveLength(0);
  });

  it('undoes and redoes manual node creation', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await wrapper.find('[data-testid="drawing-add-process"]').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('button[aria-label="撤销"]').trigger('click');

    expect(wrapper.findAll('[data-testid="drawing-node"]')).toHaveLength(0);

    await wrapper.find('button[aria-label="重做"]').trigger('click');

    expect(wrapper.findAll('[data-testid="drawing-node"]')).toHaveLength(1);
  });

  it('selects a node and deletes it with the toolbar', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await wrapper.find('[data-testid="drawing-add-process"]').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-node"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-delete"]').trigger('click');

    expect(wrapper.findAll('[data-testid="drawing-node"]')).toHaveLength(0);
  });

  it('switches tools with Drawnix-style keyboard shortcuts', async (): Promise<void> => {
    const wrapper = mount(BDrawing, {
      attachTo: document.body
    });

    await wrapper.trigger('keydown', { key: 'p' });
    expect(wrapper.find('[data-testid="drawing-add-process"]').classes()).toContain('is-active');

    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    expect(wrapper.findAll('[data-testid="drawing-node"]')).toHaveLength(1);

    await wrapper.trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('[data-testid="drawing-select-tool"]').classes()).toContain('is-active');

    await wrapper.find('[data-testid="drawing-node"]').trigger('pointerdown');
    await wrapper.trigger('keydown', { key: 'Delete' });
    expect(wrapper.findAll('[data-testid="drawing-node"]')).toHaveLength(0);

    wrapper.unmount();
  });

  it('updates zoom through toolbar buttons', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    expect(wrapper.find('[data-testid="drawing-zoom-value"]').text()).toBe('100%');
    await wrapper.find('[data-testid="drawing-zoom-in"]').trigger('click');

    expect(wrapper.find('[data-testid="drawing-zoom-value"]').text()).toBe('110%');
  });
});
