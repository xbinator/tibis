/**
 * @file tableControlsCommands.ts
 * @description 表格 NodeView 控件触发的 TipTap 表格命令映射。
 */

import type { DividerHit, SegmentHit } from './tableControlsGeometry';
import type { Editor } from '@tiptap/core';

/**
 * 表格维度信息。
 */
interface TableDimensions {
  /** 行数 */
  rowCount: number;
  /** 列数 */
  columnCount: number;
}

/**
 * 定位单元格所需的行列索引。
 */
interface TableCellPosition {
  /** 目标行索引 */
  row: number;
  /** 目标列索引 */
  column: number;
}

/**
 * 表格命令执行上下文。
 */
export interface TableCommandContext {
  /** TipTap 编辑器实例 */
  editor: Editor;
  /** 将 selection 聚焦到目标单元格 */
  focusCellAt: (position: TableCellPosition) => boolean;
  /** 读取当前表格维度 */
  getDimensions: () => TableDimensions;
}

/**
 * 计算新增行为的代表单元格。
 * @param hit - 当前命中的分割线
 * @returns 代表单元格位置
 */
function getAddFocusCell(hit: DividerHit): TableCellPosition {
  if (hit.type === 'column') {
    if (hit.edge === 'leading') {
      return { row: 0, column: 0 };
    }

    return { row: 0, column: Math.max(0, hit.index - (hit.edge === 'inner' ? 1 : 0)) };
  }

  if (hit.edge === 'leading') {
    return { row: 0, column: 0 };
  }

  return { row: Math.max(0, hit.index), column: 0 };
}

/**
 * 应用新增动作。
 * @param context - 表格命令上下文
 * @param hit - 当前命中的分割线
 * @returns 命令是否成功执行
 */
export function applyAddAction(context: TableCommandContext, hit: DividerHit): boolean {
  const focusCell = getAddFocusCell(hit);
  if (!context.focusCellAt(focusCell)) {
    return false;
  }

  const chain = context.editor.chain().focus();

  if (hit.type === 'column') {
    if (hit.edge === 'leading') {
      return chain.addColumnBefore().run();
    }

    return chain.addColumnAfter().run();
  }

  if (hit.edge === 'leading') {
    return chain.addRowBefore().run();
  }

  return chain.addRowAfter().run();
}

/**
 * 应用删除动作。
 * @param context - 表格命令上下文
 * @param hit - 当前命中的区块
 * @returns 命令是否成功执行
 */
export function applyRemoveAction(context: TableCommandContext, hit: SegmentHit): boolean {
  const dimensions = context.getDimensions();

  if (hit.type === 'column' && dimensions.columnCount <= 1) {
    return false;
  }

  if (hit.type === 'row' && dimensions.rowCount <= 1) {
    return false;
  }

  const focusCell = hit.type === 'column' ? { row: 0, column: hit.index } : { row: hit.index, column: 0 };

  if (!context.focusCellAt(focusCell)) {
    return false;
  }

  const chain = context.editor.chain().focus();
  return hit.type === 'column' ? chain.deleteColumn().run() : chain.deleteRow().run();
}
