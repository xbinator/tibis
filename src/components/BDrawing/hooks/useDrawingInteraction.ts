/**
 * @file useDrawingInteraction.ts
 * @description BDrawing 选择、删除和基础拖拽交互。
 */
import type { DrawingPoint } from '../types';
import type { UseDrawingBoardReturn } from './useDrawingBoard';

/**
 * BDrawing 交互 hook 返回值。
 */
export interface UseDrawingInteractionReturn {
  /** 选择元素 */
  selectElement: (id: string) => void;
  /** 清空选区 */
  clearSelection: () => void;
  /** 删除选区 */
  deleteSelection: () => void;
  /** 移动节点 */
  moveNode: (id: string, delta: DrawingPoint) => void;
}

/**
 * 创建画布交互 hook。
 * @param board - 画板 hook
 * @returns 交互方法
 */
export function useDrawingInteraction(board: UseDrawingBoardReturn): UseDrawingInteractionReturn {
  return {
    selectElement: (id: string): void => board.setSelection([id]),
    clearSelection: (): void => board.setSelection([]),
    deleteSelection: (): void => board.deleteSelection(),
    moveNode: (id: string, delta: DrawingPoint): void => board.moveNode(id, delta)
  };
}
