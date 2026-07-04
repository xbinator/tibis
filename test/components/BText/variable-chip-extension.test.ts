/**
 * @file variable-chip-extension.test.ts
 * @description 验证 BTextEditor 变量装饰扩展的可编辑性与 atomic 范围。
 * @vitest-environment jsdom
 */
import { EditorState } from '@codemirror/state';
import { WidgetType } from '@codemirror/view';
import { describe, expect, it } from 'vitest';
import type { ChipResolver } from '@/components/BText/extensions/variableChip';
import { chipResolverEffect, getChipAtPos, variableChipField } from '@/components/BText/extensions/variableChip';

/**
 * 测试用替换型 Chip Widget。
 */
class TestChipWidget extends WidgetType {
  /**
   * 判断 Widget 是否等价。
   * @param other - 另一个 Widget
   * @returns 是否为同类测试 Widget
   */
  eq(other: WidgetType): boolean {
    return other instanceof TestChipWidget;
  }

  /**
   * 创建测试 Widget DOM。
   * @returns Widget 根元素
   */
  toDOM(): HTMLElement {
    const element = document.createElement('span');
    element.textContent = 'chip';

    return element;
  }
}

/**
 * 使用指定解析器创建测试编辑器状态。
 * @param resolver - 变量解析器
 * @returns 应用解析器后的编辑器状态
 */
function createStateWithResolver(resolver: ChipResolver): EditorState {
  const state = EditorState.create({
    doc: '{{input}}',
    extensions: [variableChipField]
  });

  return state.update({ effects: chipResolverEffect.of(resolver) }).state;
}

describe('BTextEditor variable chip extension', (): void => {
  it('keeps className variable marks editable instead of atomic', (): void => {
    const state = createStateWithResolver(() => ({ className: 'b-prompt-variable-token' }));

    expect(getChipAtPos(state, 1)).toBeNull();
  });

  it('keeps replacement widgets atomic', (): void => {
    const state = createStateWithResolver(() => ({ widget: new TestChipWidget() }));

    expect(getChipAtPos(state, 1)).toEqual({ from: 0, to: 9 });
  });
});
