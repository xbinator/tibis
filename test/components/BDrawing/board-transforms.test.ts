/**
 * @file board-transforms.test.ts
 * @description 验证 BDrawing 手动画板 element transform 与历史记录。
 */
import { describe, expect, it } from 'vitest';
import type { DrawingBoardState, DrawingElement, DrawingShapeElement } from '@/components/BDrawing/types';
import {
  addDrawingShape,
  createDrawingBoardState,
  moveDrawingElements,
  redoDrawingBoard,
  reorderDrawingElement,
  resizeDrawingElements,
  undoDrawingBoard,
  updateDrawingElementStyle,
  updateDrawingNodeText
} from '@/components/BDrawing/utils/boardTransforms';
import { measureDrawingTextElementSize } from '@/components/BDrawing/utils/drawingTextMetrics';

/**
 * 创建测试形状元素。
 * @param id - 元素 ID
 * @returns 测试形状元素
 */
function createShapeElement(id: string): DrawingShapeElement {
  return {
    id,
    name: 'process',
    text: '流程节点',
    position: { x: 100, y: 120 },
    size: { width: 180, height: 72 },
    rotation: 0,
    metadata: { source: 'user', createdAt: 1 }
  };
}

/**
 * 旧版形状元素快照。
 */
type LegacyShapeElementSnapshot = Omit<DrawingShapeElement, 'name'> & {
  /** 旧版元素类别 */
  kind: 'shape';
  /** 旧版形状类型 */
  shape: string;
};

/**
 * 创建带旧版 kind 字段的测试形状元素。
 * @param id - 元素 ID
 * @returns 旧版形状元素
 */
function createLegacyShapeElement(id: string): DrawingShapeElement {
  const legacyElement: LegacyShapeElementSnapshot = {
    id,
    kind: 'shape',
    shape: 'rect',
    text: '旧版节点',
    position: { x: 100, y: 120 },
    size: { width: 180, height: 72 },
    rotation: 0,
    metadata: { source: 'user', createdAt: 1 }
  };

  return legacyElement as unknown as DrawingShapeElement;
}

/**
 * 断言元素为形状元素。
 * @param element - 待检查元素
 * @returns 形状元素
 */
function expectShapeElement(element: DrawingElement | undefined): DrawingShapeElement {
  expect(element).toBeDefined();
  return element as DrawingShapeElement;
}

describe('boardTransforms', (): void => {
  it('measures CJK text wider than narrow latin text with the same character count', (): void => {
    const cjkSize = measureDrawingTextElementSize('标题标题', { fontSize: 20 });
    const latinSize = measureDrawingTextElementSize('iiii', { fontSize: 20 });

    expect(cjkSize.width).toBeGreaterThan(latinSize.width);
  });

  it('supports undo and redo after adding a shape', (): void => {
    const added = addDrawingShape(createDrawingBoardState(), {
      id: 'shape-1',
      name: 'rect',
      start: { x: 40, y: 60 },
      end: { x: 160, y: 120 }
    });
    const undone = undoDrawingBoard(added);
    const redone = redoDrawingBoard(undone);

    expect(undone.elements).toHaveLength(0);
    expect(undone.history.future).toHaveLength(1);
    expect(redone.elements).toHaveLength(1);
    expect(redone.history.future).toHaveLength(0);
  });

  it('normalizes legacy shape kind out of board snapshots', (): void => {
    const initial = createDrawingBoardState({
      elements: [createLegacyShapeElement('node-1')]
    });

    expect('kind' in (initial.elements[0] ?? {})).toBe(false);
    expect('shape' in (initial.elements[0] ?? {})).toBe(false);
    expect(initial.elements[0]?.name).toBe('rect');
  });

  it('updates node text through a manual board command', (): void => {
    const initial = createDrawingBoardState({ elements: [createShapeElement('node-1')] });
    const updated = updateDrawingNodeText(initial, 'node-1', '用户手动修改');

    expect(expectShapeElement(updated.elements[0]).text).toBe('用户手动修改');
    expect(updated.history.past).toHaveLength(1);
  });

  it('grows regular shape height when committed text needs more wrapped lines', (): void => {
    const initial = createDrawingBoardState({ elements: [createShapeElement('node-1')] });
    const original = expectShapeElement(initial.elements[0]);
    const updated = updateDrawingNodeText(
      initial,
      'node-1',
      '这是一段会在普通形状中自动换行并需要更多高度展示的长文本内容，用来验证矩形等节点会随着文本内容增高'
    );
    const updatedShape = expectShapeElement(updated.elements[0]);

    expect(updatedShape.size.width).toBe(original.size.width);
    expect(updatedShape.size.height).toBeGreaterThan(original.size.height);
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
      name: 'diamond',
      start: { x: 260, y: 220 },
      end: { x: 100, y: 120 },
      createdAt: 20
    });

    expect(added.elements[0]).toMatchObject({
      id: 'shape-1',
      name: 'diamond',
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
      name: 'ellipse',
      start: { x: 200, y: 180 },
      end: { x: 203, y: 184 },
      createdAt: 20
    });

    expect(added.elements[0]?.position).toEqual({ x: 111.5, y: 146 });
    expect(added.elements[0]?.size).toEqual({ width: 180, height: 72 });
    expect(expectShapeElement(added.elements[0]).text).toBe('');
    expect(added.history.past).toHaveLength(1);
  });

  it('sizes text shapes from their text content instead of the default node size', (): void => {
    const initial = createDrawingBoardState();
    const added = addDrawingShape(initial, {
      id: 'text-1',
      name: 'text',
      start: { x: 200, y: 180 },
      end: { x: 200, y: 180 },
      text: 'Hi',
      createdAt: 20
    });

    const textElement = expectShapeElement(added.elements[0]);
    expect(textElement.position).toEqual({ x: 200, y: 180 });
    expect(textElement.size.width).toBeLessThan(180);
    expect(textElement.size.height).toBeLessThan(72);
    expect(textElement.style?.fill).toBe('transparent');

    const updated = updateDrawingNodeText(added, 'text-1', '更长的文本内容');
    expect(expectShapeElement(updated.elements[0]).size.width).toBeGreaterThan(textElement.size.width);
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
    const initial = createDrawingBoardState({
      elements: [
        {
          ...createShapeElement('node-1'),
          text: ''
        }
      ]
    });
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

  it('keeps manual width changes and grows height when resizing a text-bearing shape narrower', (): void => {
    const initial = createDrawingBoardState({
      elements: [
        {
          ...createShapeElement('node-1'),
          text: '这是一段已经存在于节点内部的长文本，拖拽修改宽度后需要重新计算换行高度'
        }
      ]
    });
    const resized = resizeDrawingElements(initial, [
      {
        id: 'node-1',
        size: { width: 80, height: 72 }
      }
    ]);
    const resizedShape = expectShapeElement(resized.elements[0]);

    expect(resizedShape.size.width).toBe(80);
    expect(resizedShape.size.height).toBeGreaterThan(72);
  });

  it('restores auto-grown text height when resizing a text-bearing shape wider', (): void => {
    const initial = createDrawingBoardState({
      elements: [
        {
          ...createShapeElement('node-1'),
          text: '这是一段已经存在于节点内部的长文本，拖拽修改宽度后需要重新计算换行高度'
        }
      ]
    });
    const narrowed = resizeDrawingElements(initial, [
      {
        id: 'node-1',
        size: { width: 80, height: 72 }
      }
    ]);
    const narrowedShape = expectShapeElement(narrowed.elements[0]);
    const widened = resizeDrawingElements(narrowed, [
      {
        id: 'node-1',
        size: { width: 260, height: narrowedShape.size.height }
      }
    ]);
    const widenedShape = expectShapeElement(widened.elements[0]);

    expect(widenedShape.size.width).toBe(260);
    expect(widenedShape.size.height).toBeLessThan(narrowedShape.size.height);
    expect(widenedShape.size.height).toBe(72);
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
