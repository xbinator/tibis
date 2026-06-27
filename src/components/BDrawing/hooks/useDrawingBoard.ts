/**
 * @file useDrawingBoard.ts
 * @description BDrawing 画板状态与命令封装。
 */
import type {
  DrawingBoardSnapshot,
  DrawingBoardState,
  DrawingElement,
  DrawingElementStyle,
  DrawingElementStyleChange,
  DrawingGeometryChange,
  DrawingLayerAction,
  DrawingPoint
} from '../types';
import { ref } from 'vue';
import type { Ref } from 'vue';
import { getDrawingElementSchema } from '../elements';
import {
  addDrawingShape,
  createDrawingBoardState,
  deleteDrawingSelection,
  moveDrawingElements,
  redoDrawingBoard,
  reorderDrawingElement,
  resizeDrawingElements,
  undoDrawingBoard,
  updateDrawingElementStyle,
  updateDrawingElementTitle
} from '../utils/boardTransforms';

/**
 * 读取自动生成 ID 中的序号。
 * @param id - 元素 ID
 * @param prefix - 自动生成 ID 前缀
 * @returns 序号，不匹配时返回 null
 */
function getGeneratedElementIdIndex(id: string, prefix: string): number | null {
  if (!id.startsWith(prefix)) {
    return null;
  }

  const rawIndex = id.slice(prefix.length);
  if (!/^\d+$/.test(rawIndex)) {
    return null;
  }

  return Number(rawIndex);
}

/**
 * 读取已有元素中指定前缀的最大自动生成序号。
 * @param elements - 元素列表
 * @param prefix - 自动生成 ID 前缀
 * @returns 最大序号
 */
function getMaxGeneratedElementIdIndex(elements: DrawingElement[], prefix: string): number {
  return elements.reduce<number>((maxIndex: number, element: DrawingElement): number => {
    const index = getGeneratedElementIdIndex(element.id, prefix);

    return index === null ? maxIndex : Math.max(maxIndex, index);
  }, 0);
}

/**
 * BDrawing 画板 hook 返回值。
 */
export interface UseDrawingBoardReturn {
  /** 响应式画板状态 */
  state: Ref<DrawingBoardState>;
  /** 开始创建形状草稿 */
  startCreateShapeDraft: (name: string, start: DrawingPoint) => void;
  /** 更新当前草稿坐标 */
  updateDraftPoint: (point: DrawingPoint) => void;
  /** 提交创建形状草稿 */
  commitCreateShapeDraft: (style?: DrawingElementStyle) => void;
  /** 清空交互草稿 */
  clearDraft: () => void;
  /** 撤销 */
  undo: () => void;
  /** 重做 */
  redo: () => void;
  /** 移动元素 */
  moveElements: (changes: DrawingGeometryChange[]) => void;
  /** 缩放元素 */
  resizeElements: (changes: DrawingGeometryChange[]) => void;
  /** 更新元素样式 */
  updateElementStyle: (elementId: string, style: DrawingElementStyleChange) => void;
  /** 删除选区 */
  deleteSelection: () => void;
  /** 更新元素自定义名称 */
  updateElementTitle: (elementId: string, title: string) => void;
  /** 调整元素层级 */
  reorderElement: (elementId: string, action: DrawingLayerAction) => void;
  /** 设置选区 */
  setSelection: (selection: string[]) => void;
  /** 重置画板状态 */
  reset: (snapshot?: Partial<DrawingBoardSnapshot>) => void;
}

/**
 * 创建画板状态 hook。
 * @param snapshot - 初始快照
 * @returns 画板 hook
 */
export function useDrawingBoard(snapshot?: Partial<DrawingBoardSnapshot>): UseDrawingBoardReturn {
  const state = ref<DrawingBoardState>(createDrawingBoardState(snapshot));
  let shapeIndex = getMaxGeneratedElementIdIndex(state.value.elements, 'drawing-shape-');

  /**
   * 按当前元素数量同步自动生成 ID 的起始序号。
   */
  function syncElementIndexes(): void {
    shapeIndex = getMaxGeneratedElementIdIndex(state.value.elements, 'drawing-shape-');
  }

  /**
   * 更新画板状态。
   * @param nextState - 新状态
   */
  function setState(nextState: DrawingBoardState): void {
    state.value = nextState;
  }

  /**
   * 创建元素初始样式，临时创建样式优先覆盖 schema 默认样式。
   * @param schemaStyle - 元素注册默认样式
   * @param creationStyle - 创建时指定样式
   * @returns 合并后的初始样式
   */
  function createInitialElementStyle(schemaStyle: DrawingElementStyle | undefined, creationStyle: DrawingElementStyle | undefined): DrawingElementStyle {
    return { ...(schemaStyle ?? {}), ...(creationStyle ?? {}) };
  }

  return {
    state,
    startCreateShapeDraft: (name: string, start: DrawingPoint): void => {
      state.value = {
        ...state.value,
        draft: {
          kind: 'creating-shape',
          name,
          start,
          current: start
        },
        selection: []
      };
    },
    updateDraftPoint: (point: DrawingPoint): void => {
      if (state.value.draft?.kind !== 'creating-shape') {
        return;
      }

      state.value = {
        ...state.value,
        draft: {
          ...state.value.draft,
          current: point
        }
      };
    },
    commitCreateShapeDraft: (style?: DrawingElementStyle): void => {
      const { draft } = state.value;
      if (draft?.kind !== 'creating-shape') {
        return;
      }

      const shapeId = `drawing-shape-${++shapeIndex}`;
      const schema = getDrawingElementSchema(draft.name);
      if (!schema) {
        state.value = {
          ...state.value,
          draft: undefined,
          lastError: new Error(`找不到元素注册配置: ${draft.name}`)
        };
        return;
      }

      setState(
        addDrawingShape(
          {
            ...state.value,
            draft: undefined
          },
          {
            id: shapeId,
            name: draft.name,
            label: schema.label,
            icon: schema.icon,
            createAnchor: schema.createAnchor,
            start: draft.start,
            end: draft.current,
            style: createInitialElementStyle(schema.style, style),
            metadata: schema.metadata
          }
        )
      );
    },
    clearDraft: (): void => {
      state.value = {
        ...state.value,
        draft: undefined
      };
    },
    undo: (): void => setState(undoDrawingBoard(state.value)),
    redo: (): void => setState(redoDrawingBoard(state.value)),
    moveElements: (changes: DrawingGeometryChange[]): void => setState(moveDrawingElements(state.value, changes)),
    resizeElements: (changes: DrawingGeometryChange[]): void => setState(resizeDrawingElements(state.value, changes)),
    updateElementStyle: (elementId: string, style: DrawingElementStyleChange): void => setState(updateDrawingElementStyle(state.value, elementId, style)),
    deleteSelection: (): void => setState(deleteDrawingSelection(state.value)),
    updateElementTitle: (elementId: string, title: string): void => setState(updateDrawingElementTitle(state.value, elementId, title)),
    reorderElement: (elementId: string, action: DrawingLayerAction): void => setState(reorderDrawingElement(state.value, elementId, action)),
    setSelection: (selection: string[]): void => {
      state.value = { ...state.value, selection };
    },
    reset: (nextSnapshot?: Partial<DrawingBoardSnapshot>): void => {
      setState(createDrawingBoardState(nextSnapshot));
      syncElementIndexes();
    }
  };
}
