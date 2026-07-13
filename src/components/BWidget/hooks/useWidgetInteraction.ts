/**
 * @file useWidgetInteraction.ts
 * @description BWidget 选择和删除交互。
 */
import type { UseWidgetBoardReturn } from './useWidgetBoard';

/**
 * BWidget 交互 hook 返回值。
 */
interface UseWidgetInteractionReturn {
  /** 清空选区 */
  clearSelection: () => void;
  /** 删除选区 */
  deleteSelection: () => void;
}

/**
 * 创建Widget交互 hook。
 * @param board - Widget hook
 * @returns 交互方法
 */
export function useWidgetInteraction(board: UseWidgetBoardReturn): UseWidgetInteractionReturn {
  return {
    clearSelection: (): void => board.onSetSelection([]),
    deleteSelection: (): void => board.onDeleteSelection()
  };
}
