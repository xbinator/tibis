/**
 * @file useJsonGraph.ts
 * @description 将 JSON 输入转换为 BJsonViewer 使用的 Vue Flow 节点图数据。
 */

import type {
  BJsonViewerProps,
  JsonFlowNodeData,
  JsonGraphResult,
  JsonNodeKind,
  JsonParseResult,
  JsonRecordRow,
  JsonValue,
  JsonVisualNode,
  PositionedVisualNode
} from '../types';
import type { Edge, Node } from '@vue-flow/core';
import { computed, type ComputedRef } from 'vue';
import { every, groupBy, isArray, isPlainObject, sortBy } from 'lodash-es';

/**
 * Hook 返回值。
 */
interface UseJsonGraphReturn {
  /** 当前解析错误信息。 */
  parseError: ComputedRef<string>;
  /** Vue Flow 节点列表。 */
  graphNodes: ComputedRef<Node<JsonFlowNodeData>[]>;
  /** Vue Flow 连线列表。 */
  graphEdges: ComputedRef<Edge[]>;
}

/** 聚合卡片宽度，与组件样式保持一致。 */
const RECORD_NODE_WIDTH = 430;

/** 叶子值节点的最小宽度估算，用于布局时避让父节点。 */
const VALUE_NODE_WIDTH = 160;

/** 父子节点之间的水平间距。 */
const HORIZONTAL_GAP = 400;

/** 卡片行高，与组件样式保持一致。 */
const ROW_HEIGHT = 54;

/** 同一行展开出的多个子节点之间的纵向间距。 */
const SIBLING_GAP = 34;

/**
 * 判断值是否为可渲染 JSON 值。
 *
 * 使用 lodash-es 的 `isArray` / `isPlainObject` / `every` 替代手写的
 * `Array.isArray`、`Object.prototype.toString` 检查及 `Object.values().every()`，
 * 语义更清晰，也避免了原型链污染场景下的误判。
 *
 * @param value - 待检查的未知值
 * @returns 是否为 JSON 值
 */
function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) {
    return true;
  }

  if (['string', 'number', 'boolean'].includes(typeof value)) {
    return Number.isFinite(value as number) || typeof value !== 'number';
  }

  if (isArray(value)) {
    return every(value, isJsonValue);
  }

  // isPlainObject 只认 {} 字面量及 Object.create(null)，
  // 可以精确排除 Date / RegExp / Map 等非 JSON 兼容对象。
  if (isPlainObject(value)) {
    return every(value as Record<string, unknown>, isJsonValue);
  }

  return false;
}

/**
 * 从组件入参解析 JSON。
 * @param props - JSON 查看器入参
 * @returns 解析结果
 */
function parseJsonInput(props: Readonly<BJsonViewerProps>): JsonParseResult {
  if (props.content?.trim()) {
    try {
      const parsedValue = JSON.parse(props.content) as unknown;
      if (!isJsonValue(parsedValue)) {
        return { value: undefined, error: '当前内容不是有效的 JSON 值' };
      }

      return { value: parsedValue, error: '' };
    } catch (error) {
      return { value: undefined, error: error instanceof Error ? error.message : '未知 JSON 解析错误' };
    }
  }

  if (props.value === undefined) {
    return { value: undefined, error: '' };
  }

  if (!isJsonValue(props.value)) {
    return { value: undefined, error: '传入 value 包含 JSON 不支持的类型' };
  }

  return { value: props.value, error: '' };
}

/**
 * 获取 JSON 值的节点类型。
 *
 * 使用 `isArray` / `isPlainObject` 替代原生判断，与 `isJsonValue` 保持一致。
 *
 * @param value - JSON 值
 * @returns 节点类型
 */
function getJsonNodeKind(value: JsonValue): JsonNodeKind {
  if (value === null) {
    return 'null';
  }

  if (isArray(value)) {
    return 'array';
  }

  if (isPlainObject(value)) {
    return 'object';
  }

  return typeof value as JsonNodeKind;
}

/**
 * 转义 JSON Pointer 路径片段。
 * @param segment - 原始路径片段
 * @returns 转义后的路径片段
 */
function escapeJsonPointerSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

/**
 * 拼接 JSON Pointer 路径。
 * @param basePath - 父路径
 * @param segment - 当前路径片段
 * @returns 子路径
 */
function joinJsonPointer(basePath: string, segment: string): string {
  return `${basePath}/${escapeJsonPointerSegment(segment)}`;
}

/**
 * 格式化基础值。
 * @param value - JSON 值
 * @returns 展示文本
 */
function formatPrimitiveValue(value: JsonValue): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value === null) {
    return 'null';
  }

  return String(value);
}

/**
 * 格式化容器摘要。
 *
 * 使用 `isArray` / `isPlainObject` 替代手写判断，与其他函数保持一致。
 *
 * @param value - JSON 值
 * @returns 展示文本
 */
function formatCollectionSummary(value: JsonValue): string {
  if (isArray(value)) {
    return `[${value.length} items]`;
  }

  if (isPlainObject(value)) {
    return `{${Object.keys(value as object).length} keys}`;
  }

  return formatPrimitiveValue(value);
}

/**
 * 创建卡片行数据。
 * @param path - 行路径
 * @param key - 字段名
 * @param value - 字段值
 * @param hasLink - 是否有外连节点
 * @returns 卡片行
 */
function createRecordRow(path: string, key: string, value: JsonValue, hasLink: boolean): JsonRecordRow {
  return {
    id: path || 'root',
    key,
    value: hasLink ? formatCollectionSummary(value) : formatPrimitiveValue(value),
    kind: getJsonNodeKind(value),
    hasLink,
    handleId: `row:${path || 'root'}`
  };
}

/**
 * 根据 JSON 值创建可视节点。
 * @param value - JSON 值
 * @param path - JSON Pointer 路径
 * @param depth - 当前深度
 * @returns 可视节点
 */
function createVisualNode(value: JsonValue, path: string, depth: number): JsonVisualNode {
  const kind = getJsonNodeKind(value);

  if (kind !== 'object') {
    return {
      id: path || 'root',
      path,
      kind,
      variant: 'value',
      depth,
      valueText: formatPrimitiveValue(value),
      rows: [],
      links: []
    };
  }

  const entries = Object.entries(value as Record<string, JsonValue>);
  const rows: JsonRecordRow[] = [];
  const links: JsonVisualNode['links'] = [];

  entries.forEach(([key, childValue], rowIndex): void => {
    const childPath = joinJsonPointer(path, key);
    const childKind = getJsonNodeKind(childValue);
    const isLinkedChild = childKind === 'object' || childKind === 'array';
    const row = createRecordRow(childPath, key, childValue, isLinkedChild);

    rows.push(row);

    if (childKind === 'object') {
      links.push({
        sourceHandle: row.handleId,
        sourceRowIndex: rowIndex,
        target: createVisualNode(childValue, childPath, depth + 1),
        label: key
      });
      return;
    }

    if (isArray(childValue)) {
      childValue.forEach((item, index): void => {
        const itemPath = joinJsonPointer(childPath, String(index));

        links.push({
          sourceHandle: row.handleId,
          sourceRowIndex: rowIndex,
          target: createVisualNode(item, itemPath, depth + 1),
          label: key
        });
      });
    }
  });

  return {
    id: path || 'root',
    path,
    kind,
    variant: 'record',
    depth,
    valueText: '',
    rows,
    links
  };
}

/**
 * 获取节点高度。
 * @param visualNode - 可视节点
 * @returns 节点高度
 */
function getVisualNodeHeight(visualNode: JsonVisualNode): number {
  if (visualNode.variant === 'value') {
    return 68;
  }

  return Math.max(68, visualNode.rows.length * ROW_HEIGHT);
}

/**
 * 获取可视节点宽度。
 * @param visualNode - 可视节点
 * @returns 节点宽度
 */
function getVisualNodeWidth(visualNode: JsonVisualNode): number {
  if (visualNode.variant === 'record') {
    return RECORD_NODE_WIDTH;
  }

  return Math.max(VALUE_NODE_WIDTH, visualNode.valueText.length * 16 + 40);
}

/**
 * 按源行分组子连线。
 *
 * 使用 lodash-es 的 `groupBy` + `sortBy` 替代手写 Map 分组逻辑，
 * 消除了样板代码并使意图更加直观。
 *
 * @param links - 子连线列表
 * @returns 按源行分组后的连线列表
 */
function groupLinksBySourceRow(links: JsonVisualNode['links']): JsonVisualNode['links'][] {
  const groups = groupBy(links, (link) => link.sourceRowIndex);

  return sortBy(Object.entries(groups), ([index]) => Number(index)).map(([, group]) => group);
}

/**
 * 递归计算节点布局。
 * @param visualNode - 当前可视节点
 * @param positionedNodes - 布局结果收集器
 * @param x - 当前节点横向坐标
 * @param y - 当前节点纵向坐标
 */
function layoutVisualNodeBranch(visualNode: JsonVisualNode, positionedNodes: Map<string, PositionedVisualNode>, x: number, y: number): void {
  positionedNodes.set(visualNode.id, { visualNode, x, y });

  const childX = x + getVisualNodeWidth(visualNode) + HORIZONTAL_GAP;
  let nextAvailableY = 0;

  groupLinksBySourceRow(visualNode.links).forEach((group): void => {
    const sourceRowIndex = group[0]?.sourceRowIndex ?? 0;
    const rowCenterY = y + sourceRowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
    const groupHeight = group.reduce<number>((height, link, index): number => {
      const gap = index === 0 ? 0 : SIBLING_GAP;
      return height + gap + getVisualNodeHeight(link.target);
    }, 0);
    let childY = Math.max(0, rowCenterY - groupHeight / 2, nextAvailableY);

    group.forEach((link): void => {
      layoutVisualNodeBranch(link.target, positionedNodes, childX, childY);
      childY += getVisualNodeHeight(link.target) + SIBLING_GAP;
    });

    nextAvailableY = childY;
  });
}

/**
 * 计算图节点布局。
 * @param visualNode - 根可视节点
 * @returns 布局后的节点 Map
 */
function layoutVisualNodes(visualNode: JsonVisualNode): Map<string, PositionedVisualNode> {
  const positionedNodes = new Map<string, PositionedVisualNode>();

  layoutVisualNodeBranch(visualNode, positionedNodes, 0, 0);

  return positionedNodes;
}

/**
 * 追加 Vue Flow 连线。
 * @param visualNode - 当前可视节点
 * @param edges - 连线收集器
 */
function appendEdges(visualNode: JsonVisualNode, edges: Edge[]): void {
  visualNode.links.forEach((link): void => {
    edges.push({
      id: `${visualNode.id}-${link.sourceHandle}-${link.target.id}`,
      source: visualNode.id,
      sourceHandle: link.sourceHandle,
      target: link.target.id,
      type: 'simplebezier',
      label: link.label,
      class: 'b-json-viewer__edge'
    });
    appendEdges(link.target, edges);
  });
}

/**
 * 将 JSON 值转换为 Vue Flow 图数据。
 * @param value - JSON 值
 * @returns 图数据
 */
function buildGraph(value: JsonValue | undefined): JsonGraphResult {
  if (value === undefined) {
    return { nodes: [], edges: [] };
  }

  const visualRoot = createVisualNode(value, '', 0);
  const positionedNodes = layoutVisualNodes(visualRoot);
  const nodes: Node<JsonFlowNodeData>[] = Array.from(positionedNodes.values()).map((positionedNode): Node<JsonFlowNodeData> => {
    const { visualNode } = positionedNode;

    return {
      id: visualNode.id,
      type: 'json',
      position: { x: positionedNode.x, y: positionedNode.y },
      data: {
        path: visualNode.path,
        kind: visualNode.kind,
        variant: visualNode.variant,
        valueText: visualNode.valueText,
        rows: visualNode.rows
      }
    };
  });
  const edges: Edge[] = [];

  appendEdges(visualRoot, edges);

  return { nodes, edges };
}

/**
 * 创建 JSON 节点图响应式数据。
 * @param props - JSON 查看器入参
 * @returns Vue Flow 图数据
 */
export function useJsonGraph(props: Readonly<BJsonViewerProps>): UseJsonGraphReturn {
  const parseResult = computed<JsonParseResult>(() => parseJsonInput(props));
  const graph = computed<JsonGraphResult>(() => buildGraph(parseResult.value.value));

  return {
    parseError: computed<string>(() => parseResult.value.error),
    graphNodes: computed<Node<JsonFlowNodeData>[]>(() => graph.value.nodes),
    graphEdges: computed<Edge[]>(() => graph.value.edges)
  };
}
