/**
 * @file useGraph.test.ts
 * @description 验证 useGraph 将 JSON 输入转换为 Vue Flow 图数据的正确性。
 */

import type { Node } from '@vue-flow/core';
import { describe, expect, it } from 'vitest';
import { useGraph } from '@/components/BJsonViewer/hooks/useGraph';
import type { BJsonViewerProps, JsonFlowNodeData } from '@/components/BJsonViewer/types';
import csJson from '../../../cs.json';

/**
 * 快捷构造 props 并获取 hook 返回值。
 * @param overrides - 部分覆盖默认 props
 * @returns hook 返回值
 */
function createHook(overrides: Partial<BJsonViewerProps> = {}): ReturnType<typeof useGraph> {
  const props: Readonly<BJsonViewerProps> = { content: '', value: undefined, ...overrides };

  return useGraph(props);
}

/** 卡片行高，与 useGraph 保持一致。 */
const ROW_HEIGHT = 54;

/** 子树之间的最小垂直间距，与 useGraph 保持一致。 */
const SIBLING_GAP = 34;

/**
 * 估算节点高度，与 useGraph 中 getVisualNodeHeight 逻辑一致。
 * @param node - Vue Flow 节点
 * @returns 估算高度
 */
function getExpectedNodeHeight(node: Node<JsonFlowNodeData>): number {
  if (node.data.variant === 'value') {
    return 68;
  }

  return Math.max(68, node.data.rows.length * ROW_HEIGHT);
}

/**
 * 递归计算子树最大底部 Y 坐标。
 * @param node - 起始节点
 * @param edges - 所有边
 * @param nodeMap - 节点映射
 * @returns 子树最大底部 Y
 */
function getSubtreeBottom(
  node: Node<JsonFlowNodeData>,
  edges: Array<{ source: string; target: string }>,
  nodeMap: Map<string, Node<JsonFlowNodeData>>
): number {
  let maxBottom = node.position.y + getExpectedNodeHeight(node);

  edges
    .filter((e) => e.source === node.id)
    .forEach((e) => {
      const child = nodeMap.get(e.target);
      if (child) {
        maxBottom = Math.max(maxBottom, getSubtreeBottom(child, edges, nodeMap));
      }
    });

  return maxBottom;
}

/**
 * 递归计算子树最小顶部 Y 坐标。
 * @param node - 起始节点
 * @param edges - 所有边
 * @param nodeMap - 节点映射
 * @returns 子树最小顶部 Y
 */
function getSubtreeTop(node: Node<JsonFlowNodeData>, edges: Array<{ source: string; target: string }>, nodeMap: Map<string, Node<JsonFlowNodeData>>): number {
  let minTop = node.position.y;

  edges
    .filter((e) => e.source === node.id)
    .forEach((e) => {
      const child = nodeMap.get(e.target);
      if (child) {
        minTop = Math.min(minTop, getSubtreeTop(child, edges, nodeMap));
      }
    });

  return minTop;
}

/**
 * 获取计算值的快捷方法。
 * @param hook - hook 返回值
 * @returns 解包后的图数据
 */
function unwrap(hook: ReturnType<typeof useGraph>) {
  return {
    parseError: hook.parseError.value,
    nodes: hook.graphNodes.value,
    edges: hook.graphEdges.value
  };
}

describe('useGraph', () => {
  describe('JSON 解析', () => {
    it('空 content 和 undefined value 时无错误，无节点', () => {
      const { parseError, nodes, edges } = unwrap(createHook());

      expect(parseError).toBe('');
      expect(nodes).toHaveLength(0);
      expect(edges).toHaveLength(0);
    });

    it('非法 JSON 字符串时返回解析错误', () => {
      const { parseError } = unwrap(createHook({ content: '{invalid' }));

      expect(parseError).toBeTruthy();
    });

    it('合法 JSON 字符串正常解析', () => {
      const { parseError, nodes } = unwrap(createHook({ content: '{"a":1}' }));

      expect(parseError).toBe('');
      expect(nodes.length).toBeGreaterThan(0);
    });

    it('value 传入非 JSON 兼容类型时报错', () => {
      const { parseError } = unwrap(createHook({ value: () => {} }));

      expect(parseError).toBeTruthy();
    });

    it('value 传入合法 JSON 值正常解析', () => {
      const { parseError, nodes } = unwrap(createHook({ value: { x: 1 } }));

      expect(parseError).toBe('');
      expect(nodes.length).toBeGreaterThan(0);
    });

    it('content 优先级高于 value', () => {
      const { nodes: nodesByContent } = unwrap(createHook({ content: '{"a":1}', value: { b: 2 } }));
      const rootNode = nodesByContent[0];

      expect(rootNode.data.rows.some((row) => row.key === 'a')).toBe(true);
    });
  });

  describe('cs.json 参考数据', () => {
    let nodes: Node<JsonFlowNodeData>[];
    let edges: ReturnType<typeof useGraph>['graphEdges']['value'];

    it('生成节点和连线', () => {
      const result = unwrap(createHook({ value: csJson }));
      nodes = result.nodes;
      edges = result.edges;

      expect(nodes.length).toBeGreaterThan(0);
      expect(edges.length).toBeGreaterThan(0);
    });

    it('根节点为数组摘要 value 节点', () => {
      const root = nodes.find((n) => n.id === 'root');

      expect(root).toBeDefined();
      expect(root!.data.variant).toBe('value');
      expect(root!.data.kind).toBe('array');
      expect(root!.data.valueText).toBe('[2 items]');
    });

    it('根数组会连接到两个订单对象节点', () => {
      const root = nodes.find((n) => n.id === 'root');
      const rootEdges = edges.filter((edge) => edge.source === 'root');

      expect(root).toBeDefined();
      expect(root!.data.rows).toHaveLength(0);
      expect(rootEdges).toHaveLength(2);
    });

    it('叶子值节点为 value 变体', () => {
      const valueNodes = nodes.filter((n) => n.data.variant === 'value');

      expect(valueNodes.length).toBeGreaterThan(0);
      valueNodes.forEach((node) => {
        expect(node.data.valueText).toBeTruthy();
        expect(node.data.rows).toHaveLength(0);
      });
    });

    it('根数组会生成为独立的数组节点，嵌套数组仍直接连接到元素', () => {
      const rootArrayNode = nodes.find((node) => node.id === 'root');
      const itemsArrayNode = nodes.find((node) => node.data.path === '/orders/0/items');

      expect(rootArrayNode).toBeDefined();
      expect(rootArrayNode!.data.kind).toBe('array');
      expect(rootArrayNode!.data.variant).toBe('value');
      expect(rootArrayNode!.data.valueText).toBe('[2 items]');

      expect(itemsArrayNode).toBeUndefined();
    });

    it('record 节点宽度在合理范围内', () => {
      const recordNodes = nodes.filter((n) => n.data.variant === 'record');

      recordNodes.forEach((node) => {
        expect(node.data.width).toBeGreaterThanOrEqual(200);
        expect(node.data.width).toBeLessThanOrEqual(800);
      });
    });

    it('value 节点宽度根据文本长度动态计算', () => {
      const valueNodes = nodes.filter((n) => n.data.variant === 'value');

      valueNodes.forEach((node) => {
        expect(node.data.width).toBeGreaterThanOrEqual(160);
      });
    });

    it('不同内容长度的 record 节点宽度不同', () => {
      const recordNodes = nodes.filter((n) => n.data.variant === 'record');
      const widths = recordNodes.map((n) => n.data.width);
      const uniqueWidths = new Set(widths);

      expect(uniqueWidths.size).toBeGreaterThan(1);
    });
  });

  describe('独立 Handle', () => {
    it('每条边对应唯一的 sourceHandle', () => {
      const { nodes, edges } = unwrap(createHook({ value: csJson }));
      const sourceHandles = edges.map((e) => e.sourceHandle);
      const uniqueHandles = new Set(sourceHandles);

      expect(sourceHandles.length).toBe(uniqueHandles.size);
    });

    it('根数组节点会按元素数量产生多个 Handle', () => {
      const { nodes, edges } = unwrap(createHook({ value: csJson }));
      const root = nodes.find((n) => n.id === 'root');

      expect(root).toBeDefined();

      const rootHandles = root!.data.handles.filter((h) => {
        const edge = edges.find((e) => e.sourceHandle === h.id);

        return edge?.source === 'root';
      });

      expect(rootHandles.length).toBe(2);
    });

    it('同一行多个 Handle 的 top 值不同', () => {
      const { nodes, edges } = unwrap(createHook({ value: csJson }));
      const root = nodes.find((n) => n.id === 'root')!;

      const modulesHandles = root.data.handles.filter((h) => {
        const edge = edges.find((e) => e.sourceHandle === h.id);

        return edge?.source === 'root';
      });

      const tops = modulesHandles.map((h) => h.top);
      const uniqueTops = new Set(tops);

      expect(uniqueTops.size).toBe(modulesHandles.length);
    });

    it('Handle 的 id 与 Edge 的 sourceHandle 一一对应', () => {
      const { nodes, edges } = unwrap(createHook({ value: csJson }));

      const allHandleIds = new Set(nodes.flatMap((n) => n.data.handles.map((h) => h.id)));
      const allSourceHandles = edges.map((e) => e.sourceHandle).filter(Boolean);

      allSourceHandles.forEach((sh) => {
        expect(allHandleIds.has(sh!)).toBe(true);
      });
    });

    it('嵌套数组字段仍直接按元素数量产生多个 Handle（如 items 有 2 个元素）', () => {
      const { nodes, edges } = unwrap(createHook({ value: csJson }));
      const orderNode = nodes.find((n) => n.data.path === '/0');

      expect(orderNode).toBeDefined();

      const itemHandles = orderNode!.data.handles.filter((h) => {
        const edge = edges.find((e) => e.sourceHandle === h.id);

        return edge?.label === 'items';
      });

      expect(itemHandles.length).toBe(2);
    });

    it('shipping 对象字段仍只产生 1 个 Handle', () => {
      const { nodes, edges } = unwrap(createHook({ value: csJson }));
      const orderNode = nodes.find((n) => n.data.path === '/0');

      expect(orderNode).toBeDefined();

      const tagsHandles = orderNode!.data.handles.filter((h) => {
        const edge = edges.find((e) => e.sourceHandle === h.id);

        return edge?.label === 'shipping';
      });

      expect(tagsHandles.length).toBe(1);
    });
  });

  describe('布局', () => {
    it('所有节点横向坐标非负', () => {
      const { nodes } = unwrap(createHook({ value: csJson }));

      nodes.forEach((node) => {
        expect(node.position.x).toBeGreaterThanOrEqual(0);
      });
    });

    it('子节点在父节点右侧', () => {
      const { nodes, edges } = unwrap(createHook({ value: csJson }));
      const nodeMap = new Map(nodes.map((n) => [n.id, n]));

      edges.forEach((edge) => {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);

        if (source && target) {
          expect(target.position.x).toBeGreaterThan(source.position.x);
        }
      });
    });

    it('整张图基于实际边界垂直居中，根节点横向位于原点', () => {
      const { nodes } = unwrap(createHook({ value: csJson }));
      const root = nodes.find((n) => n.id === 'root');

      expect(root).toBeDefined();
      expect(root!.position.x).toBe(0);

      const allTops = nodes.map((n) => n.position.y);
      const allBottoms = nodes.map((n) => n.position.y + getExpectedNodeHeight(n));
      const minY = Math.min(...allTops);
      const maxY = Math.max(...allBottoms);
      const centerY = (minY + maxY) / 2;

      expect(centerY).toBeCloseTo(0, 6);
    });

    it('同一深度的节点不发生纵向重叠', () => {
      const { nodes } = unwrap(createHook({ value: csJson }));

      const byX = new Map<number, typeof nodes>();
      nodes.forEach((node) => {
        const xKey = Math.round(node.position.x);
        const group = byX.get(xKey) ?? [];
        group.push(node);
        byX.set(xKey, group);
      });

      byX.forEach((group) => {
        const sorted = [...group].sort((a, b) => a.position.y - b.position.y);

        for (let i = 1; i < sorted.length; i++) {
          const prev = sorted[i - 1];
          const curr = sorted[i];
          const prevBottom = prev.position.y + getExpectedNodeHeight(prev);

          expect(curr.position.y).toBeGreaterThanOrEqual(prevBottom + SIBLING_GAP);
        }
      });
    });

    it('深层嵌套子树不与后续兄弟子树重叠', () => {
      const { nodes, edges } = unwrap(createHook({ value: csJson }));
      const nodeMap = new Map(nodes.map((n) => [n.id, n]));

      const root = nodes.find((n) => n.id === 'root')!;
      const rootChildren = edges
        .filter((e) => e.source === 'root')
        .map((e) => nodeMap.get(e.target))
        .filter(Boolean) as typeof nodes;

      const sorted = [...rootChildren].sort((a, b) => a!.position.y - b!.position.y);

      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1]!;
        const curr = sorted[i]!;

        const prevSubtreeBottom = getSubtreeBottom(prev, edges, nodeMap);
        const currSubtreeTop = getSubtreeTop(curr, edges, nodeMap);

        expect(currSubtreeTop).toBeGreaterThanOrEqual(prevSubtreeBottom + SIBLING_GAP);
      }
    });

    it('根节点中心与一级子节点整体中心对齐', () => {
      const { nodes, edges } = unwrap(createHook({ value: csJson }));
      const nodeMap = new Map(nodes.map((n) => [n.id, n]));
      const root = nodes.find((n) => n.id === 'root');

      expect(root).toBeDefined();

      const rootChildren = edges
        .filter((edge) => edge.source === 'root')
        .map((edge) => nodeMap.get(edge.target))
        .filter(Boolean) as Node<JsonFlowNodeData>[];

      expect(rootChildren.length).toBeGreaterThan(0);

      const childTop = Math.min(...rootChildren.map((node) => getSubtreeTop(node, edges, nodeMap)));
      const childBottom = Math.max(...rootChildren.map((node) => getSubtreeBottom(node, edges, nodeMap)));
      const childrenCenterY = (childTop + childBottom) / 2;
      const rootCenterY = root!.position.y + getExpectedNodeHeight(root!) / 2;

      expect(rootCenterY).toBeCloseTo(childrenCenterY, 6);
    });
  });

  describe('边', () => {
    it('所有边的 source 和 target 节点都存在', () => {
      const { nodes, edges } = unwrap(createHook({ value: csJson }));
      const nodeIds = new Set(nodes.map((n) => n.id));

      edges.forEach((edge) => {
        expect(nodeIds.has(edge.source)).toBe(true);
        expect(nodeIds.has(edge.target)).toBe(true);
      });
    });

    it('边使用 simplebezier 类型', () => {
      const { edges } = unwrap(createHook({ value: csJson }));

      edges.forEach((edge) => {
        expect(edge.type).toBe('simplebezier');
      });
    });
  });
});
