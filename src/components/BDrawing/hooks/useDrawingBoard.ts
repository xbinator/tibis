/**
 * @file useDrawingBoard.ts
 * @description BDrawing 画板状态与命令封装。
 */
import type { DrawingBoardSnapshot, DrawingBoardState, DrawingNodeType, DrawingPoint } from '../types';
import { ref } from 'vue';
import type { Ref } from 'vue';
import {
  addDrawingNode,
  createDrawingBoardState,
  deleteDrawingSelection,
  moveDrawingNode,
  redoDrawingBoard,
  undoDrawingBoard,
  updateDrawingNodeText
} from '../utils/boardTransforms';

/**
 * BDrawing 画板 hook 返回值。
 */
export interface UseDrawingBoardReturn {
  /** 响应式画板状态 */
  state: Ref<DrawingBoardState>;
  /** 新增节点 */
  addNode: (type: DrawingNodeType, position?: DrawingPoint) => void;
  /** 撤销 */
  undo: () => void;
  /** 重做 */
  redo: () => void;
  /** 移动节点 */
  moveNode: (nodeId: string, delta: DrawingPoint) => void;
  /** 删除选区 */
  deleteSelection: () => void;
  /** 更新节点文本 */
  updateNodeText: (nodeId: string, text: string) => void;
  /** 设置选区 */
  setSelection: (selection: string[]) => void;
}

/**
 * 创建画板状态 hook。
 * @param snapshot - 初始快照
 * @returns 画板 hook
 */
export function useDrawingBoard(snapshot?: Partial<DrawingBoardSnapshot>): UseDrawingBoardReturn {
  const state = ref<DrawingBoardState>(createDrawingBoardState(snapshot));
  let nodeIndex = state.value.nodes.length;

  /**
   * 更新画板状态。
   * @param nextState - 新状态
   */
  function setState(nextState: DrawingBoardState): void {
    state.value = nextState;
  }

  return {
    state,
    addNode: (type: DrawingNodeType, position?: DrawingPoint): void => {
      nodeIndex += 1;
      setState(
        addDrawingNode(state.value, {
          id: `drawing-node-${nodeIndex}`,
          type,
          position: position ?? {
            x: state.value.viewport.center.x - 90 + nodeIndex * 24,
            y: state.value.viewport.center.y - 36 + nodeIndex * 18
          }
        })
      );
    },
    undo: (): void => setState(undoDrawingBoard(state.value)),
    redo: (): void => setState(redoDrawingBoard(state.value)),
    moveNode: (nodeId: string, delta: DrawingPoint): void => setState(moveDrawingNode(state.value, nodeId, delta)),
    deleteSelection: (): void => setState(deleteDrawingSelection(state.value)),
    updateNodeText: (nodeId: string, text: string): void => setState(updateDrawingNodeText(state.value, nodeId, text)),
    setSelection: (selection: string[]): void => {
      state.value = { ...state.value, selection };
    }
  };
}
