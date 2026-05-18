import type { Editor } from '@tiptap/core';
import { describe, expect, it, vi } from 'vitest';
import { applyAddAction, applyRemoveAction, type TableCommandContext } from '@/components/BEditor/extensions/tableControlsCommands';
import type { SegmentHit } from '@/components/BEditor/extensions/tableControlsGeometry';

interface CommandRecorder {
  focus: ReturnType<typeof vi.fn>;
  addColumnBefore: ReturnType<typeof vi.fn>;
  addColumnAfter: ReturnType<typeof vi.fn>;
  addRowBefore: ReturnType<typeof vi.fn>;
  addRowAfter: ReturnType<typeof vi.fn>;
  deleteColumn: ReturnType<typeof vi.fn>;
  deleteRow: ReturnType<typeof vi.fn>;
  run: ReturnType<typeof vi.fn>;
}

/**
 * 创建可链式调用的命令记录器。
 * @returns 记录器对象
 */
function createRecorder(): CommandRecorder {
  const recorder = {
    focus: vi.fn(),
    addColumnBefore: vi.fn(),
    addColumnAfter: vi.fn(),
    addRowBefore: vi.fn(),
    addRowAfter: vi.fn(),
    deleteColumn: vi.fn(),
    deleteRow: vi.fn(),
    run: vi.fn()
  };

  recorder.focus.mockReturnValue(recorder);
  recorder.addColumnBefore.mockReturnValue(recorder);
  recorder.addColumnAfter.mockReturnValue(recorder);
  recorder.addRowBefore.mockReturnValue(recorder);
  recorder.addRowAfter.mockReturnValue(recorder);
  recorder.deleteColumn.mockReturnValue(recorder);
  recorder.deleteRow.mockReturnValue(recorder);
  recorder.run.mockReturnValue(true);

  return recorder;
}

/**
 * 创建最小编辑器上下文。
 * @param recorder - 命令记录器
 * @returns 测试上下文
 */
function createContext(recorder: CommandRecorder): TableCommandContext {
  return {
    editor: {
      chain: () => recorder
    } as unknown as Editor,
    focusCellAt: vi.fn(() => true),
    getDimensions: () => ({ rowCount: 3, columnCount: 3 })
  };
}

describe('tableControlsCommands', () => {
  it('uses addColumnBefore for the leading outer border', () => {
    const recorder = createRecorder();
    const context = createContext(recorder);

    applyAddAction(context, {
      type: 'column',
      index: 0,
      edge: 'leading',
      lineRect: { top: 0, right: 0, bottom: 120, left: 0, width: 0, height: 120 }
    });

    expect(context.focusCellAt).toHaveBeenCalledWith({ row: 0, column: 0 });
    expect(recorder.addColumnBefore).toHaveBeenCalledTimes(1);
    expect(recorder.addColumnAfter).not.toHaveBeenCalled();
  });

  it('uses addColumnAfter for inner dividers and targets the left column', () => {
    const recorder = createRecorder();
    const context = createContext(recorder);

    applyAddAction(context, {
      type: 'column',
      index: 1,
      edge: 'inner',
      lineRect: { top: 0, right: 120, bottom: 120, left: 120, width: 0, height: 120 }
    });

    expect(context.focusCellAt).toHaveBeenCalledWith({ row: 0, column: 0 });
    expect(recorder.addColumnAfter).toHaveBeenCalledTimes(1);
  });

  it('uses addRowBefore for the leading outer border', () => {
    const recorder = createRecorder();
    const context = createContext(recorder);

    applyAddAction(context, {
      type: 'row',
      index: 0,
      edge: 'leading',
      lineRect: { top: 0, right: 360, bottom: 0, left: 0, width: 360, height: 0 }
    });

    expect(context.focusCellAt).toHaveBeenCalledWith({ row: 0, column: 0 });
    expect(recorder.addRowBefore).toHaveBeenCalledTimes(1);
  });

  it('uses addRowAfter for inner dividers and trailing append', () => {
    const recorder = createRecorder();
    const context = createContext(recorder);

    applyAddAction(context, {
      type: 'row',
      index: 2,
      edge: 'trailing',
      lineRect: { top: 120, right: 360, bottom: 120, left: 0, width: 360, height: 0 }
    });

    expect(context.focusCellAt).toHaveBeenCalledWith({ row: 2, column: 0 });
    expect(recorder.addRowAfter).toHaveBeenCalledTimes(1);
  });

  it('deletes a hovered column and keeps selection in the targeted column', () => {
    const recorder = createRecorder();
    const context = createContext(recorder);

    applyRemoveAction(context, {
      type: 'column',
      index: 1,
      segmentRect: { top: 0, right: 240, bottom: 120, left: 120, width: 120, height: 120 }
    });

    expect(context.focusCellAt).toHaveBeenCalledWith({ row: 0, column: 1 });
    expect(recorder.deleteColumn).toHaveBeenCalledTimes(1);
  });

  it('skips remove actions when the table has only one row or one column left', () => {
    const recorder = createRecorder();
    const context = {
      ...createContext(recorder),
      getDimensions: () => ({ rowCount: 1, columnCount: 1 })
    };

    const columnResult = applyRemoveAction(context, {
      type: 'column',
      index: 0,
      segmentRect: { top: 0, right: 120, bottom: 120, left: 0, width: 120, height: 120 }
    } satisfies SegmentHit);

    const rowResult = applyRemoveAction(context, {
      type: 'row',
      index: 0,
      segmentRect: { top: 0, right: 120, bottom: 40, left: 0, width: 120, height: 40 }
    } satisfies SegmentHit);

    expect(columnResult).toBe(false);
    expect(rowResult).toBe(false);
    expect(recorder.deleteColumn).not.toHaveBeenCalled();
    expect(recorder.deleteRow).not.toHaveBeenCalled();
  });
});
