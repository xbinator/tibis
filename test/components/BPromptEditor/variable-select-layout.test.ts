/**
 * @file variable-select-layout.test.ts
 * @description 验证变量选择菜单在窄宽度下不会压缩重叠。
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import VariableSelect from '@/components/BPromptEditor/components/VariableSelect.vue';
import type { Variable } from '@/components/BPromptEditor/types';

/**
 * 测试用变量选择项。
 */
interface VariableSelectTestItem extends Variable {
  /** 变量树深度 */
  depth?: number;
  /** 是否存在子级变量 */
  hasChildren?: boolean;
  /** 子级变量是否展开 */
  expanded?: boolean;
}

/** 变量选择菜单源码。 */
const variableSelectSource = readFileSync('src/components/BPromptEditor/components/VariableSelect.vue', 'utf8');
/** 通用下拉菜单源码。 */
const selectDropdownSource = readFileSync('src/components/BPromptEditor/components/_SelectDropdown.vue', 'utf8');

/**
 * 测试用 BButton 替身，保留按钮根节点和点击事件。
 */
const BButtonStub = defineComponent({
  name: 'BButton',
  props: {
    /** 按钮类型 */
    type: {
      type: String,
      default: 'primary'
    },
    /** 按钮尺寸 */
    size: {
      type: String,
      default: 'middle'
    },
    /** 是否为方形按钮 */
    square: {
      type: Boolean,
      default: false
    },
    /** 图标名称 */
    icon: {
      type: String,
      default: ''
    },
    /** 提示文案 */
    tooltip: {
      type: String,
      default: ''
    }
  },
  emits: ['click'],
  template: '<button class="b-button" :data-icon="icon" :data-tooltip="tooltip" @click="$emit(\'click\', $event)"><slot /></button>'
});

describe('VariableSelect layout', (): void => {
  it('wraps variable item content in a vertical layout container', (): void => {
    const wrapper = mount(VariableSelect, {
      props: {
        visible: true,
        variables: [
          {
            label: '摄氏温度',
            value: 'state.weather.temperature',
            description: '当前城市的实时温度'
          }
        ],
        position: {
          top: 0,
          left: 0,
          bottom: 0
        }
      },
      global: {
        components: {
          BButton: BButtonStub
        }
      }
    });

    expect(document.body.querySelector('.variable-item')).not.toBeNull();
    expect(document.body.querySelector('.variable-item-main')).not.toBeNull();
    expect(document.body.querySelector('.variable-item-desc')).not.toBeNull();
    wrapper.unmount();
  });

  it('uses adaptive dropdown item height for variable descriptions', (): void => {
    expect(selectDropdownSource).not.toMatch(/\n\s+height:\s*32px;/);
    expect(selectDropdownSource).toContain('min-height: 32px;');
    expect(variableSelectSource).toContain('grid-template-columns: minmax(0, 1fr) auto;');
  });

  it('adds depth spacing for nested variable items', (): void => {
    const wrapper = mount(VariableSelect, {
      props: {
        visible: true,
        variables: [
          {
            label: 'input',
            value: 'input',
            depth: 0
          },
          {
            label: '城市',
            value: 'input.city',
            depth: 1
          }
        ] as VariableSelectTestItem[],
        position: {
          top: 0,
          left: 0,
          bottom: 0
        }
      },
      global: {
        components: {
          BButton: BButtonStub
        }
      }
    });
    const items = document.body.querySelectorAll<HTMLElement>('.variable-item');

    expect(items[0].style.getPropertyValue('--variable-depth')).toBe('0');
    expect(items[1].style.getPropertyValue('--variable-depth')).toBe('1');
    expect(variableSelectSource).toContain('padding-left: calc(var(--variable-depth, 0) * 14px);');
    wrapper.unmount();
  });

  it('emits toggle when the variable tree toggle is clicked', async (): Promise<void> => {
    const wrapper = mount(VariableSelect, {
      props: {
        visible: true,
        variables: [
          {
            label: 'input',
            value: 'input',
            depth: 0,
            hasChildren: true,
            expanded: true
          },
          {
            label: '城市',
            value: 'input.city',
            depth: 1
          }
        ] as VariableSelectTestItem[],
        position: {
          top: 0,
          left: 0,
          bottom: 0
        }
      },
      global: {
        components: {
          BButton: BButtonStub
        }
      }
    });
    const toggle = document.body.querySelector<HTMLElement>('.b-button');

    expect(toggle).not.toBeNull();
    await toggle?.click();

    expect(wrapper.emitted('toggle')?.[0]).toEqual([
      expect.objectContaining({
        value: 'input'
      })
    ]);
    wrapper.unmount();
  });
});
