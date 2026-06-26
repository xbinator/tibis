/**
 * @file settings-panel.test.ts
 * @description 验证画图右侧设置栏的默认、单选和多选展示规则。
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineComponent, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { Input as AInput } from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import type { DrawingData, DrawingElement } from '@/components/BDrawing/types';
import DesignSetter from '@/views/drawing/components/DesignSetter.vue';
import SettingsPanel from '@/views/drawing/components/SettingsPanel.vue';

const designSetterSource = readFileSync(resolve(process.cwd(), 'src/views/drawing/components/DesignSetter.vue'), 'utf8');
const settingsPanelSource = readFileSync(resolve(process.cwd(), 'src/views/drawing/components/SettingsPanel.vue'), 'utf8');

/**
 * 通用设置分组测试替身。
 */
const sectionBlockStub = {
  props: ['title'],
  template: '<section><h3>{{ title }}</h3><slot /></section>'
};

/**
 * 通用设置项测试替身。
 */
const sectionItemStub = {
  props: ['label', 'icon'],
  template: '<label><span>{{ label }}</span><slot /></label>'
};

/**
 * 创建测试画图元素。
 * @param id - 元素 ID
 * @returns 测试画图元素
 */
function createDrawingElement(id: string): DrawingElement {
  return {
    id,
    name: 'rect',
    label: '矩形',
    icon: 'lucide:square',
    title: '通知栏',
    position: { x: 12, y: 24 },
    size: { width: 120, height: 48 },
    rotation: 0,
    style: {
      backgroundColor: '#ffffff',
      color: '#ed6a0c',
      fontSize: 14,
      fontWeight: 400,
      textAlign: 'center'
    },
    metadata: {}
  };
}

/**
 * 创建测试画图数据。
 * @returns 测试画图数据
 */
function createDrawingData(): DrawingData {
  return {
    metadata: {},
    elements: [createDrawingElement('node-1'), createDrawingElement('node-2')],
    viewport: {
      center: { x: 0, y: 0 },
      zoom: 1
    }
  };
}

describe('Drawing SettingsPanel', (): void => {
  it('uses BSegmented for text alignment controls', (): void => {
    expect(designSetterSource).toContain('<BSegmented');
    expect(designSetterSource).not.toContain('Segmented as ASegmented');
    expect(designSetterSource).not.toContain('<ASegmented');
  });

  it('binds the design setter element through v-model', (): void => {
    expect(settingsPanelSource).toContain('<DesignSetter v-model:element="select" />');
    expect(settingsPanelSource).not.toContain('<DesignSetter :element="select" />');
  });

  it('binds design fields directly to the selected element', (): void => {
    expect(designSetterSource).toContain('v-model:value="dataItem.title"');
    expect(designSetterSource).toContain('v-model:value="dataItem.style.fontSize"');
    expect(designSetterSource).toContain('v-model:value="dataItem.position.x"');
    expect(designSetterSource).toContain('v-model:value="dataItem.size.height"');
    expect(designSetterSource).not.toContain('updateElementText');
    expect(designSetterSource).not.toContain('dataItem.text');
    expect(designSetterSource).not.toContain('selectedElementFields');
    expect(designSetterSource).not.toContain('selectedElementStyle');
    expect(designSetterSource).not.toContain('selectedElementPosition');
    expect(designSetterSource).not.toContain('selectedElementSize');
  });

  it('shows page setter when no element is selected', (): void => {
    const wrapper = mount(SettingsPanel, {
      global: {
        stubs: {
          BIcon: true,
          BSectionBlock: sectionBlockStub,
          BSectionItem: sectionItemStub
        }
      },
      props: {
        drawingData: createDrawingData(),
        select: {}
      }
    });

    expect(wrapper.text()).toContain('设置');
    expect(wrapper.text()).toContain('元素');
    expect(wrapper.text()).not.toContain('属性');
  });

  it('shows design and attribute tabs for a single selected element', (): void => {
    const data = createDrawingData();
    const wrapper = mount(SettingsPanel, {
      global: {
        stubs: {
          BIcon: true,
          BSectionBlock: sectionBlockStub,
          BSectionItem: sectionItemStub
        }
      },
      props: {
        drawingData: data,
        select: data.elements[0]
      }
    });

    expect(wrapper.text()).toContain('设计');
    expect(wrapper.text()).toContain('属性');
    expect(wrapper.text()).toContain('名称');
    expect(wrapper.findComponent(AInput).props('value')).toBe('通知栏');
  });

  it('shows read-only state when select target is null', (): void => {
    const wrapper = mount(SettingsPanel, {
      global: {
        stubs: {
          BIcon: true
        }
      },
      props: {
        drawingData: createDrawingData(),
        select: null
      }
    });

    expect(wrapper.text()).toContain('已选择多个元素');
    expect(wrapper.text()).not.toContain('属性');
  });

  it('emits the selected element reference when the design name input changes', async (): Promise<void> => {
    const element = createDrawingElement('node-1');
    const wrapper = mount(DesignSetter, {
      global: {
        stubs: {
          BColorPicker: true,
          BIcon: true,
          BSectionBlock: sectionBlockStub,
          BSectionItem: sectionItemStub,
          BSegmented: true,
          BSelect: true
        }
      },
      props: {
        element
      }
    });

    wrapper.findComponent(AInput).vm.$emit('update:value', '更新标题');
    await nextTick();

    expect(wrapper.emitted('update:element')).toBeUndefined();
    expect(element.title).toBe('更新标题');
  });

  it('emits the selected element reference from the design text alignment segmented control', async (): Promise<void> => {
    const element = createDrawingElement('node-1');
    const segmentedStub = defineComponent({
      name: 'BSegmented',
      props: {
        block: Boolean,
        options: {
          type: Array,
          required: true
        },
        value: {
          type: [String, Number],
          default: undefined
        }
      },
      emits: ['update:value'],
      template: '<button data-testid="align-left" type="button" @click="$emit(\'update:value\', \'left\')">{{ value }}</button>'
    });
    const wrapper = mount(DesignSetter, {
      global: {
        stubs: {
          BColorPicker: true,
          BIcon: true,
          BSectionBlock: sectionBlockStub,
          BSectionItem: sectionItemStub,
          BSegmented: segmentedStub,
          BSelect: true
        }
      },
      props: {
        element
      }
    });

    await wrapper.find('[data-testid="align-left"]').trigger('click');

    expect(wrapper.emitted('update:element')).toBeUndefined();
    expect(element.style.textAlign).toBe('left');
  });
});
