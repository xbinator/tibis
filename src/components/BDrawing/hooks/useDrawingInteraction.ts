/**
 * @file useDrawingInteraction.ts
 * @description BDrawing 选择和删除交互。
 */
import type { UseDrawingBoardReturn } from './useDrawingBoard';

/**
 * BDrawing 交互 hook 返回值。
 */
interface UseDrawingInteractionReturn {
  /** 清空选区 */
  clearSelection: () => void;
  /** 删除选区 */
  deleteSelection: () => void;
}

/**
 * 创建画布交互 hook。
 * @param board - 画板 hook
 * @returns 交互方法
 */
export function useDrawingInteraction(board: UseDrawingBoardReturn): UseDrawingInteractionReturn {
  return {
    clearSelection: (): void => board.setSelection([]),
    deleteSelection: (): void => board.deleteSelection()
  };
}
