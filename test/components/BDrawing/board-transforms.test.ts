/**
 * @file board-transforms.test.ts
 * @description 验证 BDrawing 手动画板 transform 与历史记录。
 */
import type { DrawingEdge, DrawingNode } from '@/components/BDrawing/types';
import { describe, expect, it } from 'vitest';
import {
  addDrawingNode,
  createDrawingBoardState,
  deleteDrawingSelection,
  moveDrawingNode,
  redoDrawingBoard,
  undoDrawingBoard,
  updateDrawingNodeText
} from '@/components/BDrawing/utils/boardTransforms';

/**
 * 创建测试节点。
 * @param id - 节点 ID
 * @returns 测试节点
 */
function createNode(id: string): DrawingNode {
  return {
    id,
    type: 'process',
    text: '流程节点',
    position: { x: 100, y: 120 },
    size: { width: 180, height: 72 },
    metadata: { source: 'user', createdAt: 1 }
  };
}

/**
 * 创建测试连线。
 * @returns 测试连线
 */
function createEdge(): DrawingEdge {
  return {
    id: 'edge-1',
    type: 'arrow',
    sourceId: 'node-1',
    targetId: 'node-2',
    metadata: { source: 'user', createdAt: 1 }
  };
}

describe('boardTransforms', (): void => {
  it('adds a manual node as one undoable history entry', (): void => {
    const initial = createDrawingBoardState();
    const added = addDrawingNode(initial, {
      id: 'node-1',
      type: 'process',
      position: { x: 40, y: 60 },
      createdAt: 10
    });

    expect(added.nodes).toHaveLength(1);
    expect(added.nodes[0]?.text).toBe('流程节点');
    expect(added.nodes[0]?.metadata.source).toBe('user');
    expect(added.selection).toEqual(['node-1']);
    expect(added.history.past).toHaveLength(1);
  });

  it('keeps the board unchanged when adding a duplicate node id', (): void => {
    const initial = createDrawingBoardState({ nodes: [createNode('node-1')] });
    const result = addDrawingNode(initial, { id: 'node-1', type: 'process' });

    expect(result.nodes).toEqual(initial.nodes);
    expect(result.lastError?.message).toContain('节点已存在');
    expect(result.history.past).toHaveLength(0);
  });

  it('supports undo and redo after a manual add', (): void => {
    const added = addDrawingNode(createDrawingBoardState(), { id: 'node-1', type: 'process' });
    const undone = undoDrawingBoard(added);
    const redone = redoDrawingBoard(undone);

    expect(undone.nodes).toHaveLength(0);
    expect(undone.history.future).toHaveLength(1);
    expect(redone.nodes).toHaveLength(1);
    expect(redone.history.future).toHaveLength(0);
  });

  it('moves a node and records the movement in history', (): void => {
    const initial = createDrawingBoardState({ nodes: [createNode('node-1')] });
    const moved = moveDrawingNode(initial, 'node-1', { x: 12, y: -8 });

    expect(moved.nodes[0]?.position).toEqual({ x: 112, y: 112 });
    expect(moved.history.past).toHaveLength(1);
  });

  it('deletes selected nodes and connected edges', (): void => {
    const initial = createDrawingBoardState({
      nodes: [createNode('node-1'), createNode('node-2')],
      edges: [createEdge()],
      selection: ['node-1']
    });
    const deleted = deleteDrawingSelection(initial);

    expect(deleted.nodes.map((node) => node.id)).toEqual(['node-2']);
    expect(deleted.edges).toHaveLength(0);
    expect(deleted.selection).toEqual([]);
  });

  it('updates node text through a manual board command', (): void => {
    const initial = createDrawingBoardState({ nodes: [createNode('node-1')] });
    const updated = updateDrawingNodeText(initial, 'node-1', '用户手动修改');

    expect(updated.nodes[0]?.text).toBe('用户手动修改');
    expect(updated.history.past).toHaveLength(1);
  });
});
