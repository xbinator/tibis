/**
 * @file variable-select-layout.test.ts
 * @description 验证变量选择菜单在窄宽度下不会压缩重叠。
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import VariableSelect from '@/components/BPromptEditor/components/VariableSelect.vue';

/** 变量选择菜单源码。 */
const variableSelectSource = readFileSync('src/components/BPromptEditor/components/VariableSelect.vue', 'utf8');
/** 通用下拉菜单源码。 */
const selectDropdownSource = readFileSync('src/components/BPromptEditor/components/_SelectDropdown.vue', 'utf8');

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
});
