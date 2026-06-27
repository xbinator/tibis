/**
 * @file table-controls-commands.test.ts
 * @description BEditor 表格控件命令映射回归测试。
 */
import type { Editor } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { applyAddAction, type TableCommandContext } from '@/components/BEditor/extensions/tableControlsCommands';
import type { DividerHit } from '@/components/BEditor/extensions/tableControlsGeometry';

/**
 * 表格控件命令测试用单元格坐标。
 */
type FocusCellPosition = Parameters<TableCommandContext['focusCellAt']>[0];

/**
 * 测试用链式命令替身。
 */
interface EditorChainMock {
  /** 聚焦编辑器并继续链式调用。 */
  focus: () => EditorChainMock;
  /** 在当前列前插入列并继续链式调用。 */
  addColumnBefore: () => EditorChainMock;
  /** 在当前列后插入列并继续链式调用。 */
  addColumnAfter: () => EditorChainMock;
  /** 在当前行前插入行并继续链式调用。 */
  addRowBefore: () => EditorChainMock;
  /** 在当前行后插入行并继续链式调用。 */
  addRowAfter: () => EditorChainMock;
  /** 执行链式命令。 */
  run: () => boolean;
}

/**
 * 表格控件命令测试上下文。
 */
interface CommandContextFixture {
  /** 被测命令上下文。 */
  context: TableCommandContext;
  /** 命令执行前聚焦过的单元格列表。 */
  focusedCells: FocusCellPosition[];
  /** 记录链式命令的调用顺序。 */
  operations: string[];
}

/**
 * 创建可记录聚焦位置与链式命令的上下文。
 * @returns 表格控件命令测试上下文
 */
function createCommandContextFixture(): CommandContextFixture {
  const focusedCells: FocusCellPosition[] = [];
  const operations: string[] = [];

  const chain: EditorChainMock = {
    focus: (): EditorChainMock => {
      operations.push('focus');
      return chain;
    },
    addColumnBefore: (): EditorChainMock => {
      operations.push('addColumnBefore');
      return chain;
    },
    addColumnAfter: (): EditorChainMock => {
      operations.push('addColumnAfter');
      return chain;
    },
    addRowBefore: (): EditorChainMock => {
      operations.push('addRowBefore');
      return chain;
    },
    addRowAfter: (): EditorChainMock => {
      operations.push('addRowAfter');
      return chain;
    },
    run: (): boolean => {
      operations.push('run');
      return true;
    }
  };

  return {
    context: {
      editor: {
        chain: (): EditorChainMock => chain
      } as unknown as Editor,
      focusCellAt: (position: FocusCellPosition): boolean => {
        focusedCells.push(position);
        return true;
      },
      getDimensions: (): { rowCount: number; columnCount: number } => ({
        rowCount: 4,
        columnCount: 3
      })
    },
    focusedCells,
    operations
  };
}

describe('table controls commands', (): void => {
  it('adds a row after the row above an inner row divider', (): void => {
    const { context, focusedCells, operations } = createCommandContextFixture();
    const hit: DividerHit = {
      type: 'row',
      index: 2,
      edge: 'inner',
      lineRect: { top: 80, right: 360, bottom: 80, left: 0, width: 360, height: 0 }
    };

    const result = applyAddAction(context, hit);

    expect(result).toBe(true);
    expect(focusedCells).toEqual([{ row: 1, column: 0 }]);
    expect(operations).toEqual(['focus', 'addRowAfter', 'run']);
  });
});
