/**
 * @file board-transforms.test.ts
 * @description 验证 BWidget 手动Widget element transform 与历史记录。
 */
import { describe, expect, it } from 'vitest';
import type { WidgetBoardState, WidgetElement, WidgetShapeElement } from '@/components/BWidget/types';
import {
  addWidgetShape,
  copyWidgetSelection,
  createWidgetBoardState,
  createWidgetDataSnapshot,
  groupWidgetSelection,
  moveWidgetElements,
  pasteWidgetElements,
  redoWidgetBoard,
  reorderWidgetElement,
  reorderWidgetSelection,
  resizeWidgetElements,
  ungroupWidgetSelection,
  undoWidgetBoard,
  updateWidgetElementStyle,
  updateWidgetElementTitle
} from '@/components/BWidget/utils/boardTransforms';

/**
 * 创建测试形状元素。
 * @param id - 元素 ID
 * @returns 测试形状元素
 */
function createShapeElement(id: string): WidgetShapeElement {
  return {
    id,
    name: 'rect',
    label: '矩形',
    icon: 'lucide:square',
    title: '矩形',
    position: { x: 100, y: 120 },
    size: { width: 180, height: 72 },
    rotation: 0,
    style: {},
    metadata: {}
  };
}

/**
 * 创建测试文本元素。
 * @param id - 元素 ID
 * @param content - 文本正文
 * @returns 测试文本元素
 */
function createTextElement(id: string, content = 'abcdef'): WidgetShapeElement {
  return {
    id,
    name: 'text',
    label: '文本',
    icon: 'lucide:type',
    title: '文本',
    position: { x: 100, y: 120 },
    size: { width: 180, height: 72 },
    rotation: 0,
    style: { fontSize: 10 },
    metadata: { content }
  };
}

/**
 * 旧版形状元素快照。
 */
interface LegacyShapeElementSnapshot {
  /** 元素 ID */
  id: string;
  /** 旧版元素类别 */
  kind: 'shape';
  /** 旧版形状类型 */
  shape: string;
  /** 旧版节点文本 */
  text: string;
  /** 旧版节点说明 */
  description?: string;
  /** 元素位置 */
  position: { x: number; y: number };
  /** 元素尺寸 */
  size: { width: number; height: number };
  /** 旋转角度 */
  rotation: number;
  /** 旧版元信息 */
  metadata: {
    /** 元素创建来源 */
    source: 'user';
    /** 创建时间戳 */
    createdAt: number;
    /** 旧版手动尺寸 */
    manualSize?: { width: number; height: number };
  };
}

/**
 * 创建带旧版 kind 字段的测试形状元素。
 * @param id - 元素 ID
 * @returns 旧版形状元素
 */
function createLegacyShapeElement(id: string): WidgetShapeElement {
  const legacyElement: LegacyShapeElementSnapshot = {
    id,
    kind: 'shape',
    shape: 'rect',
    text: '旧版节点',
    description: '旧版说明',
    position: { x: 100, y: 120 },
    size: { width: 180, height: 72 },
    rotation: 0,
    metadata: { source: 'user', createdAt: 1, manualSize: { width: 160, height: 60 } }
  };

  return legacyElement as unknown as WidgetShapeElement;
}

/**
 * 断言元素为形状元素。
 * @param element - 待检查元素
 * @returns 形状元素
 */
function expectShapeElement(element: WidgetElement | undefined): WidgetShapeElement {
  expect(element).toBeDefined();
  return element as WidgetShapeElement;
}

describe('boardTransforms', (): void => {
  it('supports undo and redo after adding a shape', (): void => {
    const added = addWidgetShape(createWidgetBoardState(), {
      id: 'shape-1',
      name: 'rect',
      label: '矩形',
      icon: 'lucide:square',
      start: { x: 40, y: 60 },
      end: { x: 160, y: 120 }
    });
    const undone = undoWidgetBoard(added);
    const redone = redoWidgetBoard(undone);

    expect(undone.elements).toHaveLength(0);
    expect(undone.history.future).toHaveLength(1);
    expect(redone.elements).toHaveLength(1);
    expect(redone.history.future).toHaveLength(0);
  });

  it('normalizes legacy shape kind out of board snapshots', (): void => {
    const initial = createWidgetBoardState({
      elements: [createLegacyShapeElement('node-1')]
    });

    expect('kind' in (initial.elements[0] ?? {})).toBe(false);
    expect('shape' in (initial.elements[0] ?? {})).toBe(false);
    expect(initial.elements[0]?.name).toBe('rect');
  });

  it('normalizes legacy snapshots into required shape element fields', (): void => {
    const initial = createWidgetBoardState({
      elements: [createLegacyShapeElement('node-1')]
    });
    const element = expectShapeElement(initial.elements[0]);

    expect(element).toMatchObject({
      id: 'node-1',
      name: 'rect',
      label: '矩形',
      icon: 'lucide:square',
      title: '矩形',
      style: {},
      metadata: {}
    });
    expect('text' in element).toBe(false);
    expect('description' in element).toBe(false);
    expect('source' in element.metadata).toBe(false);
    expect('createdAt' in element.metadata).toBe(false);
    expect('manualSize' in element.metadata).toBe(false);
  });

  it('normalizes widget data contract fields in lightweight snapshots', (): void => {
    const legacySnapshot = {
      metadata: {},
      elements: [createShapeElement('node-1')],
      viewport: {
        center: { x: 10, y: 20 },
        zoom: 1
      }
    };

    const snapshot = createWidgetDataSnapshot(legacySnapshot);

    expect(snapshot.name).toBe('');
    expect(snapshot.description).toBe('');
    expect(snapshot.inputSchema).toEqual({
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: '城市名称，例如上海'
        },
        date: {
          type: 'string',
          description: '查询日期，例如今天或明天'
        },
        unit: {
          type: 'string',
          description: '温度单位，celsius 或 fahrenheit'
        }
      },
      required: ['city']
    });
    expect(snapshot.outputSchema).toEqual({
      type: 'object',
      properties: {
        condition: {
          type: 'string',
          description: '天气概况'
        },
        temperatureCelsius: {
          type: 'number',
          description: '摄氏温度'
        },
        suggestion: {
          type: 'string',
          description: '出行建议'
        }
      },
      required: ['condition', 'temperatureCelsius']
    });
    expect(snapshot.elements).toHaveLength(1);
    expect(snapshot.viewport).toEqual({ center: { x: 10, y: 20 }, zoom: 1 });
  });

  it('updates element title through a manual board command', (): void => {
    const initial = createWidgetBoardState({ elements: [createShapeElement('node-1')] });
    const updated = updateWidgetElementTitle(initial, 'node-1', '审批节点');

    expect(expectShapeElement(updated.elements[0]).title).toBe('审批节点');
    expect(updated.history.past).toHaveLength(1);
  });

  it('updates element style as one undoable history entry', (): void => {
    const initial = createWidgetBoardState({ elements: [createShapeElement('node-1')] });
    const updated = updateWidgetElementStyle(initial, 'node-1', {
      backgroundColor: '#f97316',
      borderColorWidth: 3
    });

    expect(expectShapeElement(updated.elements[0]).style).toEqual({
      backgroundColor: '#f97316',
      borderColorWidth: 3
    });
    expect(updated.history.past).toHaveLength(1);
  });

  it('keeps board unchanged when updating style for an unknown element', (): void => {
    const initial = createWidgetBoardState({ elements: [createShapeElement('node-1')] });
    const updated = updateWidgetElementStyle(initial, 'missing-node', {
      backgroundColor: '#f97316'
    });

    expect(updated.elements).toEqual(initial.elements);
    expect(updated.lastError?.message).toContain('找不到元素');
    expect(updated.history.past).toHaveLength(0);
  });

  it('adds a custom sized shape from any drag direction', (): void => {
    const initial = createWidgetBoardState();
    const added = addWidgetShape(initial, {
      id: 'shape-1',
      name: 'rect',
      label: '矩形',
      icon: 'lucide:square',
      start: { x: 260, y: 220 },
      end: { x: 100, y: 120 }
    });

    expect(added.elements[0]).toMatchObject({
      id: 'shape-1',
      name: 'rect',
      label: '矩形',
      icon: 'lucide:square',
      title: '矩形',
      position: { x: 100, y: 120 },
      size: { width: 160, height: 100 },
      rotation: 0,
      style: {},
      metadata: {}
    });
    expect('text' in expectShapeElement(added.elements[0])).toBe(false);
    expect(added.selection).toEqual(['shape-1']);
    expect(added.history.past).toHaveLength(1);
  });

  it('falls back to the default size when a shape drag is too small', (): void => {
    const initial = createWidgetBoardState();
    const added = addWidgetShape(initial, {
      id: 'shape-1',
      name: 'rect',
      label: '矩形',
      icon: 'lucide:square',
      start: { x: 200, y: 180 },
      end: { x: 203, y: 184 }
    });

    expect(added.elements[0]?.position).toEqual({ x: 111.5, y: 146 });
    expect(added.elements[0]?.size).toEqual({ width: 180, height: 72 });
    expect(expectShapeElement(added.elements[0]).label).toBe('矩形');
    expect(expectShapeElement(added.elements[0]).title).toBe('矩形');
    expect(added.history.past).toHaveLength(1);
  });

  it('keeps the creation start point for a top-left anchored shape', (): void => {
    const initial = createWidgetBoardState();
    const added = addWidgetShape(initial, {
      id: 'shape-1',
      name: 'text',
      label: '文本',
      icon: 'lucide:type',
      createAnchor: 'top-left',
      start: { x: 320, y: 260 },
      end: { x: 200, y: 180 }
    });

    expect(added.elements[0]?.position).toEqual({ x: 320, y: 260 });
    expect(added.elements[0]?.size).toEqual({ width: 120, height: 80 });
  });

  it('moves multiple elements as one history entry', (): void => {
    const initial = createWidgetBoardState({
      elements: [createShapeElement('node-1'), createShapeElement('node-2')]
    });
    const moved = moveWidgetElements(initial, [
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
    const initial = createWidgetBoardState({
      elements: [createShapeElement('node-1')]
    });
    const resized = resizeWidgetElements(initial, [
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

  it('resizes a text element width and height while content wraps by width', (): void => {
    const initial = createWidgetBoardState({
      elements: [createTextElement('text-1')]
    });
    const resized = resizeWidgetElements(initial, [
      {
        id: 'text-1',
        position: { x: 80, y: 90 },
        size: { width: 30, height: 400 }
      }
    ]);

    expect(resized.elements[0]?.position).toEqual({ x: 80, y: 90 });
    expect(resized.elements[0]?.size).toEqual({ width: 30, height: 400 });
    expect(resized.history.past).toHaveLength(1);
  });

  it('keeps text resize height at least as tall as wrapped content', (): void => {
    const initial = createWidgetBoardState({
      elements: [createTextElement('text-1')]
    });
    const resized = resizeWidgetElements(initial, [
      {
        id: 'text-1',
        position: { x: 80, y: 90 },
        size: { width: 30, height: 12 }
      }
    ]);

    expect(resized.elements[0]?.size).toEqual({ width: 30, height: 31 });
  });

  it('preserves text model height when creating board state', (): void => {
    const initial = createWidgetBoardState({
      elements: [createTextElement('text-1')]
    });

    expect(initial.elements[0]?.size).toEqual({ width: 180, height: 72 });
  });

  it('normalizes text model height up to wrapped content height when loading', (): void => {
    const initial = createWidgetBoardState({
      elements: [
        {
          ...createTextElement('text-1'),
          size: { width: 30, height: 12 }
        }
      ]
    });

    expect(initial.elements[0]?.size).toEqual({ width: 30, height: 31 });
  });

  describe('reorderWidgetElement', (): void => {
    /** 创建包含 3 个元素的初始状态：node-1(底) → node-2(中) → node-3(顶) */
    function createThreeElementState(): WidgetBoardState {
      return createWidgetBoardState({
        elements: [createShapeElement('node-1'), createShapeElement('node-2'), createShapeElement('node-3')]
      });
    }

    it('brings an element to front (bringToFront)', (): void => {
      const state = createThreeElementState();
      const reordered = reorderWidgetElement(state, 'node-1', 'bringToFront');

      // node-1 从索引 0 移到末尾
      expect(reordered.elements.map((element) => element.id)).toEqual(['node-2', 'node-3', 'node-1']);
      expect(reordered.history.past).toHaveLength(1);
    });

    it('brings an element forward by one layer (bringForward)', (): void => {
      const state = createThreeElementState();
      const reordered = reorderWidgetElement(state, 'node-1', 'bringForward');

      // node-1 从索引 0 上移到索引 1
      expect(reordered.elements.map((element) => element.id)).toEqual(['node-2', 'node-1', 'node-3']);
      expect(reordered.history.past).toHaveLength(1);
    });

    it('sends an element backward by one layer (sendBackward)', (): void => {
      const state = createThreeElementState();
      const reordered = reorderWidgetElement(state, 'node-3', 'sendBackward');

      // node-3 从索引 2 下移到索引 1
      expect(reordered.elements.map((element) => element.id)).toEqual(['node-1', 'node-3', 'node-2']);
      expect(reordered.history.past).toHaveLength(1);
    });

    it('sends an element to back (sendToBack)', (): void => {
      const state = createThreeElementState();
      const reordered = reorderWidgetElement(state, 'node-3', 'sendToBack');

      // node-3 从索引 2 移到开头
      expect(reordered.elements.map((element) => element.id)).toEqual(['node-3', 'node-1', 'node-2']);
      expect(reordered.history.past).toHaveLength(1);
    });

    it('does not change order when bringing the top element forward', (): void => {
      const state = createThreeElementState();
      const reordered = reorderWidgetElement(state, 'node-3', 'bringForward');

      // node-3 已在最顶层，上移无效
      expect(reordered.elements.map((element) => element.id)).toEqual(['node-1', 'node-2', 'node-3']);
      expect(reordered.history.past).toHaveLength(1);
    });

    it('does not change order when sending the bottom element backward', (): void => {
      const state = createThreeElementState();
      const reordered = reorderWidgetElement(state, 'node-1', 'sendBackward');

      // node-1 已在最底层，下移无效
      expect(reordered.elements.map((element) => element.id)).toEqual(['node-1', 'node-2', 'node-3']);
      expect(reordered.history.past).toHaveLength(1);
    });

    it('keeps board unchanged when reordering a missing element', (): void => {
      const state = createThreeElementState();
      const reordered = reorderWidgetElement(state, 'missing-node', 'bringToFront');

      expect(reordered.elements.map((element) => element.id)).toEqual(['node-1', 'node-2', 'node-3']);
      expect(reordered.lastError?.message).toContain('找不到元素');
      expect(reordered.history.past).toHaveLength(0);
    });

    it('supports undo and redo after reordering', (): void => {
      const state = createThreeElementState();
      const reordered = reorderWidgetElement(state, 'node-1', 'bringToFront');
      const undone = undoWidgetBoard(reordered);
      const redone = redoWidgetBoard(undone);

      expect(undone.elements.map((element) => element.id)).toEqual(['node-1', 'node-2', 'node-3']);
      expect(redone.elements.map((element) => element.id)).toEqual(['node-2', 'node-3', 'node-1']);
    });
  });

  describe('selection commands', (): void => {
    /** 创建包含 4 个元素的初始状态：node-1(底) → node-4(顶) */
    function createFourElementState(selection: string[] = []): WidgetBoardState {
      return createWidgetBoardState({
        elements: [createShapeElement('node-1'), createShapeElement('node-2'), createShapeElement('node-3'), createShapeElement('node-4')],
        selection
      });
    }

    it('copies selected elements in layer order without mutating the source state', (): void => {
      const state = createFourElementState(['node-3', 'node-1']);
      const copied = copyWidgetSelection(state);

      expect(copied.map((element) => element.id)).toEqual(['node-1', 'node-3']);
      copied[0].position.x = 999;
      expect(state.elements[0]?.position.x).toBe(100);
    });

    it('pastes copied elements at the requested board point with fresh ids and group ids', (): void => {
      const groupedElements: WidgetShapeElement[] = [
        {
          ...createShapeElement('node-1'),
          position: { x: 10, y: 20 },
          metadata: { groupId: 'group-1' }
        },
        {
          ...createShapeElement('node-2'),
          position: { x: 50, y: 70 },
          metadata: { groupId: 'group-1' }
        }
      ];
      const state = createWidgetBoardState({
        elements: groupedElements,
        selection: ['node-1', 'node-2']
      });
      const copied = copyWidgetSelection(state);
      const pasted = pasteWidgetElements(state, copied, {
        anchorPoint: { x: 200, y: 300 },
        createElementId: (_element: WidgetShapeElement, index: number): string => `copy-${index + 1}`,
        createGroupId: (_groupId: string, index: number): string => `copy-group-${index + 1}`
      });

      expect(pasted.elements.map((element) => element.id)).toEqual(['node-1', 'node-2', 'copy-1', 'copy-2']);
      expect(pasted.elements[2]?.position).toEqual({ x: 200, y: 300 });
      expect(pasted.elements[3]?.position).toEqual({ x: 240, y: 350 });
      expect(pasted.elements[2]?.metadata.groupId).toBe('copy-group-1');
      expect(pasted.elements[3]?.metadata.groupId).toBe('copy-group-1');
      expect(pasted.selection).toEqual(['copy-1', 'copy-2']);
      expect(pasted.history.past).toHaveLength(1);
    });

    it('groups and ungroups the selected elements through metadata group ids', (): void => {
      const grouped = groupWidgetSelection(createFourElementState(['node-1', 'node-2']), 'widget-group-1');
      const ungrouped = ungroupWidgetSelection({
        ...grouped,
        selection: ['node-1']
      });

      expect(grouped.elements[0]?.metadata.groupId).toBe('widget-group-1');
      expect(grouped.elements[1]?.metadata.groupId).toBe('widget-group-1');
      expect(grouped.elements[2]?.metadata.groupId).toBeUndefined();
      expect(ungrouped.elements[0]?.metadata.groupId).toBeUndefined();
      expect(ungrouped.elements[1]?.metadata.groupId).toBeUndefined();
    });

    it('reorders a multi-selection while preserving its relative order', (): void => {
      const state = createFourElementState(['node-2', 'node-3']);
      const front = reorderWidgetSelection(state, 'bringToFront');
      const backward = reorderWidgetSelection(state, 'sendBackward');

      expect(front.elements.map((element) => element.id)).toEqual(['node-1', 'node-4', 'node-2', 'node-3']);
      expect(backward.elements.map((element) => element.id)).toEqual(['node-2', 'node-3', 'node-1', 'node-4']);
    });
  });
});
