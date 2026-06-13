/**
 * @file useDrawingBoard.ts
 * @description BDrawing 画板状态与命令封装。
 */
import type {
  DrawingBoardSnapshot,
  DrawingBoardState,
  DrawingConnectorDraftOptions,
  DrawingConnectorEndpoint,
  DrawingConnectorOptionsChange,
  DrawingElementStyle,
  DrawingElementStyleChange,
  DrawingGeometryChange,
  DrawingLayerAction,
  DrawingNodeChange,
  DrawingNodeType,
  DrawingPoint,
  DrawingShapeType
} from '../types';
import { ref } from 'vue';
import type { Ref } from 'vue';
import {
  addDrawingConnector,
  addDrawingNode,
  addDrawingShape,
  createDrawingBoardState,
  deleteDrawingSelection,
  moveDrawingElements,
  moveDrawingNode,
  redoDrawingBoard,
  reorderDrawingElement,
  resizeDrawingElements,
  rotateDrawingElements,
  undoDrawingBoard,
  updateDrawingConnectorOptions,
  updateDrawingElementStyle,
  updateDrawingNodeProperties,
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
  /** 开始创建形状草稿 */
  startCreateShapeDraft: (shape: DrawingShapeType, start: DrawingPoint) => void;
  /** 更新当前草稿坐标 */
  updateDraftPoint: (point: DrawingPoint) => void;
  /** 提交创建形状草稿 */
  commitCreateShapeDraft: (style?: DrawingElementStyle) => void;
  /** 开始创建连接线草稿 */
  startCreateConnectorDraft: (source: DrawingConnectorEndpoint, current: DrawingPoint) => void;
  /** 更新当前连接线草稿坐标 */
  updateConnectorDraftPoint: (point: DrawingPoint) => void;
  /** 提交创建连接线草稿 */
  commitCreateConnectorDraft: (target: DrawingConnectorEndpoint, options?: DrawingConnectorDraftOptions) => void;
  /** 清空交互草稿 */
  clearDraft: () => void;
  /** 撤销 */
  undo: () => void;
  /** 重做 */
  redo: () => void;
  /** 移动节点 */
  moveNode: (nodeId: string, delta: DrawingPoint) => void;
  /** 移动元素 */
  moveElements: (changes: DrawingGeometryChange[]) => void;
  /** 缩放元素 */
  resizeElements: (changes: DrawingGeometryChange[]) => void;
  /** 旋转元素 */
  rotateElements: (changes: DrawingGeometryChange[]) => void;
  /** 更新元素样式 */
  updateElementStyle: (elementId: string, style: DrawingElementStyleChange) => void;
  /** 更新连接线配置 */
  updateConnectorOptions: (connectorId: string, options: DrawingConnectorOptionsChange) => void;
  /** 删除选区 */
  deleteSelection: () => void;
  /** 更新节点文本 */
  updateNodeText: (nodeId: string, text: string) => void;
  /** 更新节点属性（文本、描述等） */
  updateNodeProperties: (nodeId: string, change: DrawingNodeChange) => void;
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
  let nodeIndex = state.value.elements.length;
  let shapeIndex = state.value.elements.length;
  let connectorIndex = state.value.elements.length;

  /**
   * 按当前元素数量同步自动生成 ID 的起始序号。
   */
  function syncElementIndexes(): void {
    const elementCount = state.value.elements.length;
    nodeIndex = elementCount;
    shapeIndex = elementCount;
    connectorIndex = elementCount;
  }

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
    startCreateShapeDraft: (shape: DrawingShapeType, start: DrawingPoint): void => {
      state.value = {
        ...state.value,
        draft: {
          kind: 'creating-shape',
          shape,
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

      const isProcessShape = draft.shape === 'process';
      const shapeId = isProcessShape ? `drawing-node-${++nodeIndex}` : `drawing-shape-${++shapeIndex}`;

      setState(
        addDrawingShape(
          {
            ...state.value,
            draft: undefined
          },
          {
            id: shapeId,
            shape: draft.shape,
            start: draft.start,
            end: draft.current,
            style
          }
        )
      );
    },
    startCreateConnectorDraft: (source: DrawingConnectorEndpoint, current: DrawingPoint): void => {
      state.value = {
        ...state.value,
        draft: {
          kind: 'creating-connector',
          source,
          current
        },
        selection: []
      };
    },
    updateConnectorDraftPoint: (point: DrawingPoint): void => {
      if (state.value.draft?.kind !== 'creating-connector') {
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
    commitCreateConnectorDraft: (target: DrawingConnectorEndpoint, options?: DrawingConnectorDraftOptions): void => {
      if (state.value.draft?.kind !== 'creating-connector') {
        return;
      }

      connectorIndex += 1;
      setState(
        addDrawingConnector(
          {
            ...state.value,
            draft: undefined
          },
          {
            id: `drawing-connector-${connectorIndex}`,
            sourceId: state.value.draft.source.elementId,
            sourceAnchor: state.value.draft.source.anchor,
            targetId: target.elementId,
            targetAnchor: target.anchor,
            style: options?.style,
            markerStart: options?.markerStart,
            markerEnd: options?.markerEnd,
            curve: options?.curve
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
    moveNode: (nodeId: string, delta: DrawingPoint): void => setState(moveDrawingNode(state.value, nodeId, delta)),
    moveElements: (changes: DrawingGeometryChange[]): void => setState(moveDrawingElements(state.value, changes)),
    resizeElements: (changes: DrawingGeometryChange[]): void => setState(resizeDrawingElements(state.value, changes)),
    rotateElements: (changes: DrawingGeometryChange[]): void => setState(rotateDrawingElements(state.value, changes)),
    updateElementStyle: (elementId: string, style: DrawingElementStyleChange): void => setState(updateDrawingElementStyle(state.value, elementId, style)),
    updateConnectorOptions: (connectorId: string, options: DrawingConnectorOptionsChange): void =>
      setState(updateDrawingConnectorOptions(state.value, connectorId, options)),
    deleteSelection: (): void => setState(deleteDrawingSelection(state.value)),
    updateNodeText: (nodeId: string, text: string): void => setState(updateDrawingNodeText(state.value, nodeId, text)),
    updateNodeProperties: (nodeId: string, change: DrawingNodeChange): void => setState(updateDrawingNodeProperties(state.value, nodeId, change)),
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
