/**
 * @file select.component.test.ts
 * @description 验证 BSmartSelect 支持静态选择和切换到变量输入。
 * @vitest-environment jsdom
 */
import type { PropType, Ref } from 'vue';
import { defineComponent, nextTick, ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import BSmartSelect from '@/components/BSmart/Select.vue';
import type { VariableOptionGroup } from '@/components/BSmart/types';

/**
 * 测试宿主组件实例。
 */
interface TextSelectHostVm {
  /** 当前选择值 */
  value: boolean | string;
}

/**
 * BSelect 测试桩属性。
 */
interface TextSelectStubProps {
  /** 当前选中内部值 */
  value?: string | number;
  /** 静态选项列表 */
  options?: Array<{ label: string; value: string | number }>;
}

/**
 * 创建变量候选。
 * @returns 变量分组选项
 */
function createVariableOptions(): VariableOptionGroup[] {
  return [
    {
      type: 'variable',
      options: [
        {
          label: '加载中',
          value: 'loading'
        }
      ]
    }
  ];
}

/**
 * 挂载 BSmartSelect。
 * @param initialValue - 初始值
 * @returns 组件包装器
 */
function mountTextSelect(initialValue: boolean | string): VueWrapper {
  const Host = defineComponent({
    name: 'TextSelectHost',
    components: {
      BSmartSelect
    },
    setup(): { value: Ref<boolean | string>; variables: VariableOptionGroup[] } {
      const value = ref<boolean | string>(initialValue);

      return {
        value,
        variables: createVariableOptions()
      };
    },
    template: `
      <BSmartSelect
        v-model:value="value"
        :options="[
          { label: '启用', value: false },
          { label: '禁用', value: true }
        ]"
        :variables="variables"
      />
    `
  });

  return mount(Host, {
    global: {
      components: {
        BButton: defineComponent({
          name: 'BButtonStub',
          emits: {
            /**
             * 触发按钮点击。
             * @returns 是否允许触发事件
             */
            click: (): boolean => true
          },
          template: '<button v-bind="$attrs" type="button" @click="$emit(\'click\')"><slot></slot></button>'
        }),
        BIcon: defineComponent({
          name: 'BIconStub',
          template: '<i></i>'
        }),
        BSelect: defineComponent({
          name: 'BSelectStub',
          props: {
            value: { type: [String, Number], default: undefined },
            options: {
              type: Array as PropType<Array<{ label: string; value: string | number }>>,
              default: (): Array<{ label: string; value: string | number }> => []
            }
          },
          emits: {
            /**
             * 更新选项值。
             * @param value - 内部选项值
             * @returns 是否允许触发事件
             */
            'update:value': (value: string | number): boolean => typeof value === 'string' || typeof value === 'number'
          },
          template: `
            <div class="b-smart-select-test-select">
              <button
                v-for="item in options"
                :key="item.value"
                class="b-smart-select-test-option"
                type="button"
                @click="$emit('update:value', item.value)"
              >
                {{ item.label }}
              </button>
            </div>
          `
        }),
        BSmartInput: defineComponent({
          name: 'BSmartInputStub',
          props: {
            value: { type: String, default: '' },
            options: {
              type: Array as PropType<VariableOptionGroup[]>,
              default: (): VariableOptionGroup[] => []
            },
            replaceEntireValue: { type: Boolean, default: false },
            placeholder: { type: String, default: '' },
            disabled: { type: Boolean, default: false }
          },
          emits: {
            /**
             * 更新输入值。
             * @param value - 输入值
             * @returns 是否允许触发事件
             */
            'update:value': (value: string): boolean => typeof value === 'string'
          },
          template: `
            <div class="b-smart-select-test-input">
              <input
                class="b-smart-select-test-input-control"
                :value="value"
                @input="$emit('update:value', $event.target.value)"
              />
              <button
                class="b-smart-select-test-input-variable"
                type="button"
                @click="$emit('update:value', '{{ loading }}')"
              >
                变量
              </button>
            </div>
          `
        })
      }
    }
  });
}

/**
 * 查找 BSmartInput stub。
 * @param wrapper - 组件包装器
 * @returns BSmartInput 包装器
 */
function findTextInput(wrapper: VueWrapper): VueWrapper {
  return wrapper.findComponent({ name: 'BSmartInputStub' });
}

describe('BSmartSelect', (): void => {
  it('overwrites the model with a static option value', async (): Promise<void> => {
    const wrapper = mountTextSelect(false);

    await wrapper.findAll('.b-smart-select-test-option')[1].trigger('click');

    expect((wrapper.vm as unknown as TextSelectHostVm).value).toBe(true);
    wrapper.unmount();
  });

  it('switches to BSmartInput when the variable button is clicked', async (): Promise<void> => {
    const wrapper = mountTextSelect(false);

    await wrapper.find('.b-smart-select__variable-button').trigger('click');

    const input = findTextInput(wrapper);
    const inputProps = input.props() as { options?: VariableOptionGroup[]; replaceEntireValue?: boolean };

    expect(input.exists()).toBe(true);
    expect(inputProps.replaceEntireValue).toBe(true);
    expect(inputProps.options).toEqual(createVariableOptions());
    wrapper.unmount();
  });

  it('overwrites the model with the value emitted by BSmartInput', async (): Promise<void> => {
    const wrapper = mountTextSelect(false);

    await wrapper.find('.b-smart-select__variable-button').trigger('click');
    await wrapper.find('.b-smart-select-test-input-variable').trigger('click');

    expect((wrapper.vm as unknown as TextSelectHostVm).value).toBe('{{ loading }}');
    wrapper.unmount();
  });

  it('renders BSmartInput immediately when the current value is a variable template', (): void => {
    const wrapper = mountTextSelect('{{ $input.field }}');
    const input = findTextInput(wrapper);
    const inputProps = input.props() as { value?: string };

    expect(input.exists()).toBe(true);
    expect(inputProps.value).toBe('$input.field');
    expect(wrapper.findComponent({ name: 'BSelectStub' }).exists()).toBe(false);
    wrapper.unmount();
  });

  it('wraps raw BSmartInput values as variable templates in the model', async (): Promise<void> => {
    const wrapper = mountTextSelect('{{ loading }}');

    await wrapper.find('.b-smart-select-test-input-control').setValue('$input.nextField');

    expect((wrapper.vm as unknown as TextSelectHostVm).value).toBe('{{ $input.nextField }}');
    wrapper.unmount();
  });

  it('switches back to static select mode from variable input mode', async (): Promise<void> => {
    const wrapper = mountTextSelect('{{ loading }}');

    await wrapper.find('.b-smart-select__select-button').trigger('click');

    const select = wrapper.findComponent({ name: 'BSelectStub' });
    const selectProps = select.props() as TextSelectStubProps;

    expect(findTextInput(wrapper).exists()).toBe(false);
    expect(select.exists()).toBe(true);
    expect(selectProps.value).toBeUndefined();
    expect(selectProps.options).not.toContainEqual({
      label: '{{ loading }}',
      value: '{{ loading }}'
    });
    wrapper.unmount();
  });

  it('switches back to static select mode when the external model value becomes static', async (): Promise<void> => {
    const wrapper = mountTextSelect('{{ loading }}');

    expect(findTextInput(wrapper).exists()).toBe(true);

    (wrapper.vm as unknown as TextSelectHostVm).value = false;
    await nextTick();

    const select = wrapper.findComponent({ name: 'BSelectStub' });
    const selectProps = select.props() as TextSelectStubProps;

    expect(findTextInput(wrapper).exists()).toBe(false);
    expect(select.exists()).toBe(true);
    expect(selectProps.value).toBe('static:0:boolean:false');
    wrapper.unmount();
  });
});
