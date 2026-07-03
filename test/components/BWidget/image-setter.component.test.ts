/**
 * @file image-setter.component.test.ts
 * @description 验证 BWidget 图片元素 Setter 的地址、填充模式与替代文本编辑。
 * @vitest-environment jsdom
 */
import { defineComponent } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ImageSetter from '@/components/BWidget/elements/Image/Setter.vue';
import type { WidgetElement } from '@/components/BWidget/types';

/**
 * 创建测试图片元素。
 * @returns 测试图片元素
 */
function createImageElement(): WidgetElement {
  return {
    id: 'image-1',
    name: 'image',
    label: '图片',
    icon: 'lucide:image',
    title: '图片名称',
    position: { x: 0, y: 0 },
    size: { width: 120, height: 80 },
    rotation: 0,
    style: {},
    metadata: {
      src: 'https://example.com/a.png',
      fit: 'cover'
    }
  };
}

/**
 * 挂载图片 Setter。
 * @param element - 图片元素
 * @returns 组件包装器
 */
function mountImageSetter(element: WidgetElement): VueWrapper {
  return mount(ImageSetter, {
    props: {
      element
    },
    global: {
      components: {
        BSectionBlock: defineComponent({
          name: 'BSectionBlockStub',
          props: {
            title: { type: String, required: true }
          },
          template: '<section class="widget-image-setter-stub" :data-title="title"><slot></slot></section>'
        }),
        BSectionItem: defineComponent({
          name: 'BSectionItemStub',
          props: {
            label: { type: String, default: undefined },
            direction: { type: String, default: undefined }
          },
          template: '<div class="widget-image-setter-stub-item" :data-label="label"><slot></slot></div>'
        }),
        AInput: defineComponent({
          name: 'AInputStub',
          props: {
            value: { type: String, default: undefined },
            placeholder: { type: String, default: undefined },
            allowClear: { type: Boolean, default: false }
          },
          emits: {
            'update:value': (value: string): boolean => typeof value === 'string'
          },
          template: '<input class="widget-image-setter-stub-input" :value="value" @input="$emit(\'update:value\', $event.target.value)" />'
        }),
        ASelect: defineComponent({
          name: 'ASelectStub',
          props: {
            value: { type: [String, Number], default: undefined },
            options: { type: Array, default: (): unknown[] => [] }
          },
          emits: {
            'update:value': (value: string | number): boolean => typeof value === 'string' || typeof value === 'number'
          },
          template: `
            <select class="widget-image-setter-stub-select" :value="value" @change="$emit('update:value', $event.target.value)">
              <option v-for="opt in options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          `
        })
      }
    }
  });
}

describe('Image Setter', (): void => {
  it('writes src to metadata when the address input changes', async (): Promise<void> => {
    const element = createImageElement();
    const wrapper = mountImageSetter(element);
    const input = wrapper.find('.widget-image-setter-stub-item[data-label="地址"] .widget-image-setter-stub-input');

    await input.setValue('https://cdn.example.com/b.png');

    expect(element.metadata.src).toBe('https://cdn.example.com/b.png');
    wrapper.unmount();
  });

  it('writes alt to metadata when the alt input changes', async (): Promise<void> => {
    const element = createImageElement();
    const wrapper = mountImageSetter(element);
    const input = wrapper.find('.widget-image-setter-stub-item[data-label="替代文本"] .widget-image-setter-stub-input');

    await input.setValue('一张示意图');

    expect(element.metadata.alt).toBe('一张示意图');
    wrapper.unmount();
  });

  it('writes fit to metadata when the select changes', async (): Promise<void> => {
    const element = createImageElement();
    const wrapper = mountImageSetter(element);
    const select = wrapper.find('.widget-image-setter-stub-select');

    await select.setValue('contain');

    expect(element.metadata.fit).toBe('contain');
    wrapper.unmount();
  });

  it('initializes inputs with existing metadata values', (): void => {
    const element = createImageElement();
    element.metadata.src = 'https://example.com/init.png';
    element.metadata.fit = 'contain';
    element.metadata.alt = '初始替代文本';
    const wrapper = mountImageSetter(element);
    const inputs = wrapper.findAll('.widget-image-setter-stub-input');
    const select = wrapper.find('.widget-image-setter-stub-select');

    expect((inputs[0].element as HTMLInputElement).value).toBe('https://example.com/init.png');
    expect((select.element as HTMLSelectElement).value).toBe('contain');
    expect((inputs[1].element as HTMLInputElement).value).toBe('初始替代文本');
    wrapper.unmount();
  });

  it('falls back to default fit when metadata fit is invalid', async (): Promise<void> => {
    const element = createImageElement();
    element.metadata.fit = 'invalid-fit' as unknown as undefined;
    const wrapper = mountImageSetter(element);
    const select = wrapper.find('.widget-image-setter-stub-select');

    expect((select.element as HTMLSelectElement).value).toBe('cover');
    wrapper.unmount();
  });

  it('preserves unrelated metadata when updating src', async (): Promise<void> => {
    const element = createImageElement();
    element.metadata.helperText = '辅助信息';
    const wrapper = mountImageSetter(element);
    const input = wrapper.find('.widget-image-setter-stub-item[data-label="地址"] .widget-image-setter-stub-input');

    await input.setValue('https://example.com/new.png');

    expect(element.metadata.src).toBe('https://example.com/new.png');
    expect(element.metadata.fit).toBe('cover');
    expect(element.metadata.helperText).toBe('辅助信息');
    wrapper.unmount();
  });
});
