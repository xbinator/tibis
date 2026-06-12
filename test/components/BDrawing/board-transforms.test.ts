/**
 * @file board-transforms.test.ts
 * @description 验证 BDrawing 手动画板 element transform 与历史记录。
 */
import { describe, expect, it } from 'vitest';
import type { DrawingBoardState, DrawingConnectorElement, DrawingEdge, DrawingElement, DrawingShapeElement } from '@/components/BDrawing/types';
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
  updateDrawingNodeText
} from '@/components/BDrawing/utils/boardTransforms';

/**
 * 创建测试形状元素。
 * @param id - 元素 ID
 * @returns 测试形状元素
 */
function createShapeElement(id: string): DrawingShapeElement {
  return {
    id,
    kind: 'shape',
    shape: 'process',
    text: '流程节点',
    position: { x: 100, y: 120 },
    size: { width: 180, height: 72 },
    rotation: 0,
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

/**
 * 断言元素为形状元素。
 * @param element - 待检查元素
 * @returns 形状元素
 */
function expectShapeElement(element: DrawingElement | undefined): DrawingShapeElement {
  expect(element?.kind).toBe('shape');
  return element as DrawingShapeElement;
}

/**
 * 断言元素为连接线元素。
 * @param element - 待检查元素
 * @returns 连接线元素
 */
function expectConnectorElement(element: DrawingElement | undefined): DrawingConnectorElement {
  expect(element?.kind).toBe('connector');
  return element as DrawingConnectorElement;
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

    expect(added.elements).toHaveLength(1);
    expect(added.elements[0]?.kind).toBe('shape');
    expect(added.elements[0]?.rotation).toBe(0);
    expect(expectShapeElement(added.elements[0]).text).toBe('流程节点');
    expect(added.elements[0]?.metadata.source).toBe('user');
    expect(added.selection).toEqual(['node-1']);
    expect(added.history.past).toHaveLength(1);
  });

  it('keeps the board unchanged when adding a duplicate node id', (): void => {
    const initial = createDrawingBoardState({ elements: [createShapeElement('node-1')] });
    const result = addDrawingNode(initial, { id: 'node-1', type: 'process' });

    expect(result.elements).toEqual(initial.elements);
    expect(result.lastError?.message).toContain('节点已存在');
    expect(result.history.past).toHaveLength(0);
  });

  it('supports undo and redo after a manual add', (): void => {
    const added = addDrawingNode(createDrawingBoardState(), { id: 'node-1', type: 'process' });
    const undone = undoDrawingBoard(added);
    const redone = redoDrawingBoard(undone);

    expect(undone.elements).toHaveLength(0);
    expect(undone.history.future).toHaveLength(1);
    expect(redone.elements).toHaveLength(1);
    expect(redone.history.future).toHaveLength(0);
  });

  it('moves a node and records the movement in history', (): void => {
    const initial = createDrawingBoardState({ elements: [createShapeElement('node-1')] });
    const moved = moveDrawingNode(initial, 'node-1', { x: 12, y: -8 });

    expect(moved.elements[0]?.position).toEqual({ x: 112, y: 112 });
    expect(moved.history.past).toHaveLength(1);
  });

  it('deletes selected nodes and connected edges', (): void => {
    const initial = createDrawingBoardState({
      elements: [createShapeElement('node-1'), createShapeElement('node-2')],
      edges: [createEdge()],
      selection: ['node-1']
    });
    const deleted = deleteDrawingSelection(initial);

    expect(deleted.elements.map((element) => element.id)).toEqual(['node-2']);
    expect(deleted.edges).toHaveLength(0);
    expect(deleted.selection).toEqual([]);
  });

  it('updates node text through a manual board command', (): void => {
    const initial = createDrawingBoardState({ elements: [createShapeElement('node-1')] });
    const updated = updateDrawingNodeText(initial, 'node-1', '用户手动修改');

    expect(expectShapeElement(updated.elements[0]).text).toBe('用户手动修改');
    expect(updated.history.past).toHaveLength(1);
  });

  it('updates element style as one undoable history entry', (): void => {
    const initial = createDrawingBoardState({ elements: [createShapeElement('node-1')] });
    const updated = updateDrawingElementStyle(initial, 'node-1', {
      fill: '#f97316',
      strokeWidth: 3
    });

    expect(expectShapeElement(updated.elements[0]).style).toEqual({
      fill: '#f97316',
      strokeWidth: 3
    });
    expect(updated.history.past).toHaveLength(1);
  });

  it('keeps board unchanged when updating style for an unknown element', (): void => {
    const initial = createDrawingBoardState({ elements: [createShapeElement('node-1')] });
    const updated = updateDrawingElementStyle(initial, 'missing-node', {
      fill: '#f97316'
    });

    expect(updated.elements).toEqual(initial.elements);
    expect(updated.lastError?.message).toContain('找不到元素');
    expect(updated.history.past).toHaveLength(0);
  });

  it('adds a custom sized shape from any drag direction', (): void => {
    const initial = createDrawingBoardState();
    const added = addDrawingShape(initial, {
      id: 'shape-1',
      shape: 'diamond',
      start: { x: 260, y: 220 },
      end: { x: 100, y: 120 },
      createdAt: 20
    });

    expect(added.elements[0]).toMatchObject({
      id: 'shape-1',
      kind: 'shape',
      shape: 'diamond',
      position: { x: 100, y: 120 },
      size: { width: 160, height: 100 },
      rotation: 0
    });
    expect(added.selection).toEqual(['shape-1']);
    expect(added.history.past).toHaveLength(1);
  });

  it('falls back to the default size when a shape drag is too small', (): void => {
    const initial = createDrawingBoardState();
    const added = addDrawingShape(initial, {
      id: 'shape-1',
      shape: 'ellipse',
      start: { x: 200, y: 180 },
      end: { x: 203, y: 184 },
      createdAt: 20
    });

    expect(added.elements[0]?.position).toEqual({ x: 111.5, y: 146 });
    expect(added.elements[0]?.size).toEqual({ width: 180, height: 72 });
    expect(expectShapeElement(added.elements[0]).text).toBe('椭圆');
    expect(added.history.past).toHaveLength(1);
  });

  it('moves multiple elements as one history entry', (): void => {
    const initial = createDrawingBoardState({
      elements: [createShapeElement('node-1'), createShapeElement('node-2')]
    });
    const moved = moveDrawingElements(initial, [
      { id: 'node-1', position: { x: 140, y: 160 } },
      { id: 'node-2', position: { x: 220, y: 240 } }
    ]);

    expect(moved.elements.map((element) => element.position)).toEqual([
      { x: 140, y: 160 },
      { x: 220, y: 240 }
    ]);
    expect(moved.history.past).toHaveLength(1);
  });

  it('resizes an element with the minimum size clamp', (): void => {
    const initial = createDrawingBoardState({ elements: [createShapeElement('node-1')] });
    const resized = resizeDrawingElements(initial, [
      {
        id: 'node-1',
        position: { x: 80, y: 90 },
        size: { width: 4, height: 12 }
      }
    ]);

    expect(resized.elements[0]?.position).toEqual({ x: 80, y: 90 });
    expect(resized.elements[0]?.size).toEqual({ width: 16, height: 16 });
    expect(resized.history.past).toHaveLength(1);
  });

  it('rotates an element and normalizes the angle', (): void => {
    const initial = createDrawingBoardState({ elements: [createShapeElement('node-1')] });
    const rotated = rotateDrawingElements(initial, [
      {
        id: 'node-1',
        rotation: -45
      }
    ]);

    expect(rotated.elements[0]?.rotation).toBe(315);
    expect(rotated.history.past).toHaveLength(1);
  });

  it('adds a connector element between two shapes', (): void => {
    const initial = createDrawingBoardState({
      elements: [createShapeElement('node-1'), createShapeElement('node-2')]
    });
    const connected = addDrawingConnector(initial, {
      id: 'connector-1',
      sourceId: 'node-1',
      targetId: 'node-2',
      style: { stroke: '#ef4444', strokeWidth: 3 },
      curve: 'bezier',
      markerEnd: 'none',
      markerStart: 'arrow',
      createdAt: 30
    });

    expect(connected.elements[2]).toMatchObject({
      id: 'connector-1',
      kind: 'connector',
      source: { elementId: 'node-1', anchor: 'center' },
      target: { elementId: 'node-2', anchor: 'center' },
      style: { stroke: '#ef4444', strokeWidth: 3 },
      curve: 'bezier',
      markerEnd: 'none',
      markerStart: 'arrow'
    });
    expect(connected.selection).toEqual(['connector-1']);
    expect(connected.history.past).toHaveLength(1);
  });

  it('updates connector options as one undoable history entry', (): void => {
    const connected = addDrawingConnector(
      createDrawingBoardState({
        elements: [createShapeElement('node-1'), createShapeElement('node-2')]
      }),
      {
        id: 'connector-1',
        sourceId: 'node-1',
        targetId: 'node-2'
      }
    );
    const updated = updateDrawingConnectorOptions(connected, 'connector-1', {
      curve: 'bezier',
      markerEnd: 'none',
      markerStart: 'arrow'
    });

    expect(expectConnectorElement(updated.elements[2])).toMatchObject({
      curve: 'bezier',
      markerEnd: 'none',
      markerStart: 'arrow'
    });
    expect(updated.history.past).toHaveLength(2);
  });

  it('keeps the board unchanged when connector endpoints are missing', (): void => {
    const initial = createDrawingBoardState({ elements: [createShapeElement('node-1')] });
    const result = addDrawingConnector(initial, {
      id: 'connector-1',
      sourceId: 'node-1',
      targetId: 'missing'
    });

    expect(result.elements).toEqual(initial.elements);
    expect(result.lastError?.message).toContain('找不到连接目标');
    expect(result.history.past).toHaveLength(0);
  });

  it('deletes connectors attached to a deleted shape and restores them on undo', (): void => {
    const connected = addDrawingConnector(
      createDrawingBoardState({
        elements: [createShapeElement('node-1'), createShapeElement('node-2')]
      }),
      {
        id: 'connector-1',
        sourceId: 'node-1',
        targetId: 'node-2'
      }
    );
    const selectedShape = {
      ...connected,
      selection: ['node-1']
    };
    const deleted = deleteDrawingSelection(selectedShape);
    const restored = undoDrawingBoard(deleted);

    expect(deleted.elements.map((element) => element.id)).toEqual(['node-2']);
    expect(restored.elements.map((element) => element.id)).toEqual(['node-1', 'node-2', 'connector-1']);
  });

  describe('reorderDrawingElement', (): void => {
    /** 创建包含 3 个元素的初始状态：node-1(底) → node-2(中) → node-3(顶) */
    function createThreeElementState(): DrawingBoardState {
      return createDrawingBoardState({
        elements: [createShapeElement('node-1'), createShapeElement('node-2'), createShapeElement('node-3')]
      });
    }

    it('brings an element to front (bringToFront)', (): void => {
      const state = createThreeElementState();
      const reordered = reorderDrawingElement(state, 'node-1', 'bringToFront');

      // node-1 从索引 0 移到末尾
      expect(reordered.elements.map((element) => element.id)).toEqual(['node-2', 'node-3', 'node-1']);
      expect(reordered.history.past).toHaveLength(1);
    });

    it('brings an element forward by one layer (bringForward)', (): void => {
      const state = createThreeElementState();
      const reordered = reorderDrawingElement(state, 'node-1', 'bringForward');

      // node-1 从索引 0 上移到索引 1
      expect(reordered.elements.map((element) => element.id)).toEqual(['node-2', 'node-1', 'node-3']);
      expect(reordered.history.past).toHaveLength(1);
    });

    it('sends an element backward by one layer (sendBackward)', (): void => {
      const state = createThreeElementState();
      const reordered = reorderDrawingElement(state, 'node-3', 'sendBackward');

      // node-3 从索引 2 下移到索引 1
      expect(reordered.elements.map((element) => element.id)).toEqual(['node-1', 'node-3', 'node-2']);
      expect(reordered.history.past).toHaveLength(1);
    });

    it('sends an element to back (sendToBack)', (): void => {
      const state = createThreeElementState();
      const reordered = reorderDrawingElement(state, 'node-3', 'sendToBack');

      // node-3 从索引 2 移到开头
      expect(reordered.elements.map((element) => element.id)).toEqual(['node-3', 'node-1', 'node-2']);
      expect(reordered.history.past).toHaveLength(1);
    });

    it('does not change order when bringing the top element forward', (): void => {
      const state = createThreeElementState();
      const reordered = reorderDrawingElement(state, 'node-3', 'bringForward');

      // node-3 已在最顶层，上移无效
      expect(reordered.elements.map((element) => element.id)).toEqual(['node-1', 'node-2', 'node-3']);
      expect(reordered.history.past).toHaveLength(1);
    });

    it('does not change order when sending the bottom element backward', (): void => {
      const state = createThreeElementState();
      const reordered = reorderDrawingElement(state, 'node-1', 'sendBackward');

      // node-1 已在最底层，下移无效
      expect(reordered.elements.map((element) => element.id)).toEqual(['node-1', 'node-2', 'node-3']);
      expect(reordered.history.past).toHaveLength(1);
    });

    it('keeps board unchanged when reordering a missing element', (): void => {
      const state = createThreeElementState();
      const reordered = reorderDrawingElement(state, 'missing-node', 'bringToFront');

      expect(reordered.elements.map((element) => element.id)).toEqual(['node-1', 'node-2', 'node-3']);
      expect(reordered.lastError?.message).toContain('找不到元素');
      expect(reordered.history.past).toHaveLength(0);
    });

    it('supports undo and redo after reordering', (): void => {
      const state = createThreeElementState();
      const reordered = reorderDrawingElement(state, 'node-1', 'bringToFront');
      const undone = undoDrawingBoard(reordered);
      const redone = redoDrawingBoard(undone);

      expect(undone.elements.map((element) => element.id)).toEqual(['node-1', 'node-2', 'node-3']);
      expect(redone.elements.map((element) => element.id)).toEqual(['node-2', 'node-3', 'node-1']);
    });
  });
});
