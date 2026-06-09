/**
 * @file boardTransforms.ts
 * @description BDrawing 画板状态变换、历史记录与 Plait Core 适配边界。
 */
import type { DrawingAddNodeOptions, DrawingBoardSnapshot, DrawingBoardState, DrawingEdge, DrawingNode, DrawingPoint, DrawingViewport } from '../types';
import type { PlaitElement } from '@plait/core';
import { createBoard } from '@plait/core';
import { cloneDeep } from 'lodash-es';
import { DRAWING_DEFAULT_NODE_SIZE, DRAWING_NODE_TYPE_TEXT } from '../constants/defaults';

/**
 * 创建默认视口。
 * @returns 默认视口
 */
function createDefaultViewport(): DrawingViewport {
  return {
    center: { x: 0, y: 0 },
    zoom: 1
  };
}

/**
 * 创建画板快照。
 * @param state - 画板状态
 * @returns 快照
 */
function createSnapshot(state: DrawingBoardSnapshot): DrawingBoardSnapshot {
  return {
    nodes: cloneDeep(state.nodes),
    edges: cloneDeep(state.edges),
    selection: [...state.selection],
    viewport: cloneDeep(state.viewport)
  };
}

/**
 * 将 BDrawing 节点转换为 Plait Core element。
 * @param node - BDrawing 节点
 * @returns Plait element
 */
function nodeToPlaitElement(node: DrawingNode): PlaitElement {
  return {
    id: node.id,
    type: node.type,
    points: [
      [node.position.x, node.position.y],
      [node.position.x + node.size.width, node.position.y + node.size.height]
    ],
    text: node.text,
    description: node.description,
    metadata: node.metadata
  };
}

/**
 * 将 BDrawing 连线转换为 Plait Core element。
 * @param edge - BDrawing 连线
 * @returns Plait element
 */
function edgeToPlaitElement(edge: DrawingEdge): PlaitElement {
  return {
    id: edge.id,
    type: edge.type,
    sourceId: edge.sourceId,
    targetId: edge.targetId,
    label: edge.label,
    metadata: edge.metadata
  };
}

/**
 * 创建 Plait Core board 并返回其 children 快照。
 * 这是第一版 Vue 渲染层与 Plait Core 的适配边界，后续 transform 会在这里收敛。
 * @param nodes - BDrawing 节点
 * @param edges - BDrawing 连线
 * @returns Plait element 列表
 */
function createPlaitChildrenSnapshot(nodes: DrawingNode[], edges: DrawingEdge[]): PlaitElement[] {
  const board = createBoard([...nodes.map(nodeToPlaitElement), ...edges.map(edgeToPlaitElement)], { readonly: false });

  return board.children;
}

/**
 * 创建带历史记录的新状态。
 * @param previous - 之前状态
 * @param next - 新快照
 * @returns 新状态
 */
function withHistory(previous: DrawingBoardState, next: DrawingBoardSnapshot): DrawingBoardState {
  createPlaitChildrenSnapshot(next.nodes, next.edges);

  return {
    ...next,
    history: {
      past: [...previous.history.past, createSnapshot(previous)],
      future: []
    },
    lastError: undefined
  };
}

/**
 * 创建错误状态。
 * @param state - 原状态
 * @param error - 错误
 * @returns 带错误的新状态
 */
function withError(state: DrawingBoardState, error: Error): DrawingBoardState {
  return {
    ...state,
    history: {
      past: [...state.history.past],
      future: [...state.history.future]
    },
    lastError: error
  };
}

/**
 * 创建初始画板状态。
 * @param snapshot - 初始快照
 * @returns 画板状态
 */
export function createDrawingBoardState(snapshot?: Partial<DrawingBoardSnapshot>): DrawingBoardState {
  const state = {
    nodes: cloneDeep(snapshot?.nodes ?? []),
    edges: cloneDeep(snapshot?.edges ?? []),
    selection: [...(snapshot?.selection ?? [])],
    viewport: cloneDeep(snapshot?.viewport ?? createDefaultViewport()),
    history: {
      past: [],
      future: []
    }
  };

  createPlaitChildrenSnapshot(state.nodes, state.edges);

  return state;
}

/**
 * 新增一个手动画板节点。
 * @param state - 当前画板状态
 * @param options - 新节点参数
 * @returns 新画板状态
 */
export function addDrawingNode(state: DrawingBoardState, options: DrawingAddNodeOptions): DrawingBoardState {
  if (state.nodes.some((node) => node.id === options.id)) {
    return withError(state, new Error(`节点已存在: ${options.id}`));
  }

  const node: DrawingNode = {
    id: options.id,
    type: options.type,
    text: options.text ?? DRAWING_NODE_TYPE_TEXT[options.type],
    description: options.description,
    position: cloneDeep(options.position ?? state.viewport.center),
    size: cloneDeep(options.size ?? DRAWING_DEFAULT_NODE_SIZE),
    metadata: {
      source: 'user',
      createdAt: options.createdAt ?? Date.now()
    }
  };

  return withHistory(state, {
    nodes: [...cloneDeep(state.nodes), node],
    edges: cloneDeep(state.edges),
    selection: [node.id],
    viewport: cloneDeep(state.viewport)
  });
}

/**
 * 撤销画板操作。
 * @param state - 当前画板状态
 * @returns 新画板状态
 */
export function undoDrawingBoard(state: DrawingBoardState): DrawingBoardState {
  const previous = state.history.past.at(-1);
  if (!previous) {
    return state;
  }

  return {
    ...createSnapshot(previous),
    history: {
      past: state.history.past.slice(0, -1),
      future: [createSnapshot(state), ...state.history.future]
    },
    lastError: undefined
  };
}

/**
 * 重做画板操作。
 * @param state - 当前画板状态
 * @returns 新画板状态
 */
export function redoDrawingBoard(state: DrawingBoardState): DrawingBoardState {
  const next = state.history.future[0];
  if (!next) {
    return state;
  }

  return {
    ...createSnapshot(next),
    history: {
      past: [...state.history.past, createSnapshot(state)],
      future: state.history.future.slice(1)
    },
    lastError: undefined
  };
}

/**
 * 移动画板节点。
 * @param state - 当前画板状态
 * @param nodeId - 节点 ID
 * @param delta - 移动增量
 * @returns 新画板状态
 */
export function moveDrawingNode(state: DrawingBoardState, nodeId: string, delta: DrawingPoint): DrawingBoardState {
  const nextNodes = cloneDeep(state.nodes);
  const node = nextNodes.find((item) => item.id === nodeId);
  if (!node) {
    return withError(state, new Error(`找不到节点: ${nodeId}`));
  }

  node.position = {
    x: node.position.x + delta.x,
    y: node.position.y + delta.y
  };

  return withHistory(state, {
    nodes: nextNodes,
    edges: cloneDeep(state.edges),
    selection: [...state.selection],
    viewport: cloneDeep(state.viewport)
  });
}

/**
 * 删除当前选中元素。
 * @param state - 当前画板状态
 * @returns 新画板状态
 */
export function deleteDrawingSelection(state: DrawingBoardState): DrawingBoardState {
  if (!state.selection.length) {
    return state;
  }

  const selected = new Set(state.selection);
  const nextNodes = state.nodes.filter((node) => !selected.has(node.id));
  const nextEdges = state.edges.filter((edge) => !selected.has(edge.id) && !selected.has(edge.sourceId) && !selected.has(edge.targetId));

  return withHistory(state, {
    nodes: nextNodes,
    edges: nextEdges,
    selection: [],
    viewport: cloneDeep(state.viewport)
  });
}

/**
 * 更新节点文本。
 * @param state - 当前画板状态
 * @param nodeId - 节点 ID
 * @param text - 新文本
 * @returns 新画板状态
 */
export function updateDrawingNodeText(state: DrawingBoardState, nodeId: string, text: string): DrawingBoardState {
  const nextNodes = cloneDeep(state.nodes);
  const node = nextNodes.find((item) => item.id === nodeId);
  if (!node) {
    return withError(state, new Error(`找不到节点: ${nodeId}`));
  }

  node.text = text;

  return withHistory(state, {
    nodes: nextNodes,
    edges: cloneDeep(state.edges),
    selection: [...state.selection],
    viewport: cloneDeep(state.viewport)
  });
}
