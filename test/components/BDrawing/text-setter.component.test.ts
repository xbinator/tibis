/**
 * @file text-setter.component.test.ts
 * @description 验证 BDrawing 文本元素 Setter 使用 BSection 结构并能编辑文本内容。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
import { defineComponent } from 'vue';
import type { PropType } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import TextSetter from '@/components/BDrawing/elements/Text/Setter.vue';
import type { DrawingElement } from '@/components/BDrawing/types';

/**
 * 创建测试文本元素。
 * @returns 测试文本元素
 */
function createTextElement(): DrawingElement {
  return {
    id: 'text-1',
    name: 'text',
    label: '文本',
    icon: 'lucide:type',
    title: '文本名称',
    position: { x: 0, y: 0 },
    size: { width: 100, height: 24 },
    rotation: 0,
    style: {},
    metadata: {
      content: '原始内容'
    }
  };
}

describe('Text Setter', (): void => {
  it('renders text controls through BSection components', async (): Promise<void> => {
    const element = createTextElement();
    const wrapper = mount(TextSetter, {
      props: {
        element
      },
      global: {
        components: {
          BSectionBlock: defineComponent({
            name: 'BSectionBlockStub',
            props: {
              title: {
                type: String,
                required: true
              }
            },
            template: '<section data-testid="section-block" :data-title="title"><slot></slot></section>'
          }),
          BSectionItem: defineComponent({
            name: 'BSectionItemStub',
            props: {
              label: {
                type: String,
                default: undefined
              }
            },
            template: '<label data-testid="section-item" :data-label="label"><slot></slot></label>'
          }),
          ATextarea: defineComponent({
            name: 'ATextareaStub',
            props: {
              value: {
                type: String as PropType<string>,
                default: ''
              }
            },
            emits: {
              /**
               * 更新文本值。
               * @param value - 新文本值
               * @returns 是否允许触发事件
               */
              'update:value': (value: string): boolean => typeof value === 'string'
            },
            template: '<textarea data-testid="text-setter-textarea" :value="value" @input="$emit(\'update:value\', $event.target.value)"></textarea>'
          })
        }
      }
    });

    expect(wrapper.find('[data-testid="drawing-text-setter"]').attributes('data-title')).toBe('文本属性');
    expect(wrapper.find('[data-testid="section-item"]').attributes('data-label')).toBe('内容');

    await wrapper.find('[data-testid="text-setter-textarea"]').setValue('更新后的文本');

    expect(element.title).toBe('文本名称');
    expect(element.metadata.content).toBe('更新后的文本');
    wrapper.unmount();
  });
});
