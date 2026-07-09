/**
 * @file input.component.test.ts
 * @description 验证 BText 单行输入支持变量按钮插入与 {{ 触发补全。
 * @vitest-environment jsdom
 */
import { defineComponent, nextTick } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import BTextInput from '@/components/BText/Input.vue';
import type { VariableOptionGroup } from '@/components/BText/types';

/**
 * 创建变量选项。
 * @returns 变量选项分组
 */
function createVariableOptions(): VariableOptionGroup[] {
  return [
    {
      type: 'variable',
      options: [
        {
          label: '入参',
          value: '$input',
          children: [
            {
              label: '城市名称',
              value: '$input.city'
            },
            {
              label: '图片地址',
              value: '$input.imageUrl'
            }
          ]
        },
        {
          label: '天气',
          value: 'weather',
          children: [
            {
              label: '图标地址',
              value: 'weather.iconUrl'
            }
          ]
        }
      ]
    }
  ];
}

/**
 * 挂载单行变量输入。
 * @param value - 初始输入值
 * @param extraProps - 额外组件属性
 * @param attachTo - 挂载目标
 * @returns 输入组件包装器
 */
function mountTextInput(value = 'https://cdn.example.com/', extraProps: Record<string, unknown> = {}, attachTo: Element = document.body): VueWrapper {
  const wrapper: VueWrapper = mount(BTextInput, {
    props: {
      value,
      options: createVariableOptions(),
      placeholder: '图片地址',
      ...extraProps,
      'onUpdate:value': (nextValue: string): void => {
        wrapper.setProps({ value: nextValue }).catch((error: unknown): void => {
          throw error;
        });
      }
    },
    global: {
      components: {
        BButton: defineComponent({
          name: 'BButtonStub',
          inheritAttrs: false,
          props: {
            icon: {
              type: String,
              default: ''
            }
          },
          emits: {
            /**
             * 透传点击事件。
             * @returns 是否允许触发事件
             */
            click: (): boolean => true
          },
          template: '<button v-bind="$attrs" type="button" :data-icon="icon" @click="$emit(\'click\')"></button>'
        }),
        BIcon: defineComponent({
          name: 'BIconStub',
          props: {
            icon: {
              type: String,
              required: true
            }
          },
          template: '<span class="b-icon-stub" :data-icon="icon"></span>'
        })
      }
    },
    attachTo
  });

  return wrapper;
}

describe('BText Input', (): void => {
  afterEach((): void => {
    document.body.innerHTML = '';
  });

  it('inserts the selected variable at the current cursor from the variable button', async (): Promise<void> => {
    const wrapper = mountTextInput('https://cdn.example.com/');
    const input = wrapper.find<HTMLInputElement>('.b-text-input__control input');

    input.element.setSelectionRange(8, 8);
    await input.trigger('focus');
    await input.trigger('select');
    await wrapper.find('.b-text-input__variable').trigger('click');
    await nextTick();
    document.body.querySelectorAll<HTMLElement>('.select-dropdown__item')[2]?.click();
    await nextTick();

    expect(wrapper.emitted('update:value')?.at(-1)).toEqual(['https://{{ $input.imageUrl }}cdn.example.com/']);
    wrapper.unmount();
  });

  it('opens filtered variables after typing an open template trigger', async (): Promise<void> => {
    const wrapper = mountTextInput('');
    const input = wrapper.find<HTMLInputElement>('.b-text-input__control input');

    await input.setValue('{{ci');
    await nextTick();

    const labels = Array.from(document.body.querySelectorAll('.variable-item-label')).map((item: Element): string => item.textContent ?? '');

    expect(labels).toContain('$input');
    expect(labels).toContain('city');
    expect(labels).not.toContain('imageUrl');
    wrapper.unmount();
  });

  it('renders the mouse-opened variable dropdown inside the input for stable alignment', async (): Promise<void> => {
    const wrapper = mountTextInput('');
    const root = wrapper.find('.b-text-input').element as HTMLElement;

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 500
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 400
    });
    root.getBoundingClientRect = (): DOMRect =>
      ({
        bottom: 72,
        height: 32,
        left: 250,
        right: 430,
        top: 40,
        width: 180,
        x: 250,
        y: 40,
        toJSON: (): Record<string, number> => ({})
      } as DOMRect);

    await wrapper.find('.b-text-input__variable').trigger('click');

    const dropdown = document.body.querySelector<HTMLElement>('.select-dropdown');

    expect(root.querySelector('.select-dropdown')).toBe(dropdown);
    expect(dropdown?.style.width).toBe('100%');
    expect(dropdown?.style.left).toBe('0px');
    wrapper.unmount();
  });

  it('opens the variable dropdown above when the scroll container lacks space below', async (): Promise<void> => {
    const scrollContainer = document.createElement('div');
    scrollContainer.style.overflowY = 'auto';
    document.body.appendChild(scrollContainer);

    const wrapper = mountTextInput('', {}, scrollContainer);
    const root = wrapper.find('.b-text-input').element as HTMLElement;

    scrollContainer.getBoundingClientRect = (): DOMRect =>
      ({
        bottom: 220,
        height: 120,
        left: 0,
        right: 320,
        top: 100,
        width: 320,
        x: 0,
        y: 100,
        toJSON: (): Record<string, number> => ({})
      } as DOMRect);
    root.getBoundingClientRect = (): DOMRect =>
      ({
        bottom: 216,
        height: 32,
        left: 12,
        right: 292,
        top: 184,
        width: 280,
        x: 12,
        y: 184,
        toJSON: (): Record<string, number> => ({})
      } as DOMRect);

    await wrapper.find('.b-text-input__variable').trigger('click');

    const dropdown = root.querySelector<HTMLElement>('.select-dropdown');

    expect(dropdown?.style.bottom).toBe('calc(100% + 4px)');
    expect(dropdown?.style.top).toBe('');
    expect(dropdown?.style.maxHeight).toBe('80px');
    wrapper.unmount();
  });

  it('inserts the variable as a plain path when useTemplateSyntax is false', async (): Promise<void> => {
    const wrapper = mountTextInput('', { useTemplateSyntax: false });
    const input = wrapper.find<HTMLInputElement>('.b-text-input__control input');

    await input.trigger('focus');
    await wrapper.find('.b-text-input__variable').trigger('click');
    await nextTick();
    document.body.querySelectorAll<HTMLElement>('.select-dropdown__item')[2]?.click();
    await nextTick();

    expect(wrapper.emitted('update:value')?.at(-1)).toEqual(['$input.imageUrl']);
    wrapper.unmount();
  });

  it('replaces the whole value when replaceEntireValue is true', async (): Promise<void> => {
    const wrapper = mountTextInput('prefix ');
    const input = wrapper.find<HTMLInputElement>('.b-text-input__control input');

    await wrapper.setProps({ replaceEntireValue: true });
    input.element.setSelectionRange(3, 3);
    await input.trigger('focus');
    await input.trigger('select');
    await wrapper.find('.b-text-input__variable').trigger('click');
    await nextTick();
    document.body.querySelectorAll<HTMLElement>('.select-dropdown__item')[2]?.click();
    await nextTick();

    expect(wrapper.emitted('update:value')?.at(-1)).toEqual(['{{ $input.imageUrl }}']);
    wrapper.unmount();
  });
});
