/**
 * @file use-widget-board.test.ts
 * @description 验证 BWidget Widget hook 的选区菜单命令。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWidgetBoard } from '@/components/BWidget/hooks/useWidgetBoard';
import type { WidgetElement, WidgetShapeElement } from '@/components/BWidget/types';
import { createDefaultWidgetElementLoopConfig } from '@/components/BWidget/utils/widgetLoop';

/**
 * 带可选子元素字段的测试元素。
 */
type WidgetElementWithChildren = WidgetShapeElement & {
  /** 子元素列表 */
  children?: WidgetElement[];
};

/** nanoid 测试替身。 */
const nanoidMock = vi.hoisted(() => vi.fn<() => string>());

vi.mock('nanoid', () => ({
  nanoid: nanoidMock
}));

/**
 * 创建测试形状元素。
 * @param id - 元素 ID
 * @param x - 元素横坐标
 * @param y - 元素纵坐标
 * @returns 测试形状元素
 */
function createShapeElement(id: string, x: number, y: number): WidgetShapeElement {
  return {
    id,
    name: 'rect',
    label: '矩形',
    icon: 'lucide:square',
    title: '矩形',
    position: { x, y },
    size: { width: 100, height: 60 },
    rotation: 0,
    style: {},
    loop: createDefaultWidgetElementLoopConfig(),
    metadata: {}
  };
}

describe('useWidgetBoard selection commands', (): void => {
  beforeEach((): void => {
    nanoidMock.mockReset();
  });

  it('excludes unused element commands from the public API', (): void => {
    const board = useWidgetBoard();

    expect(board).not.toHaveProperty('updateElementStyle');
    expect(board).not.toHaveProperty('reorderElement');
  });

  it('returns every command with an on-prefixed name', (): void => {
    const board = useWidgetBoard();
    const commandNames = Object.entries(board)
      .filter((entry: [string, unknown]): boolean => typeof entry[1] === 'function')
      .map((entry: [string, unknown]): string => entry[0]);

    expect(commandNames).toEqual([
      'onStartShapeDraft',
      'onUpdateDraftPoint',
      'onCommitShapeDraft',
      'onClearDraft',
      'onUndo',
      'onRedo',
      'onMoveElements',
      'onResizeElements',
      'onDeleteSelection',
      'onCopySelection',
      'onPasteClipboard',
      'onGroupSelection',
      'onUngroupSelection',
      'onUpdateElementTitle',
      'onReorderSelection',
      'onSetSelectionLocked',
      'onSetSelection',
      'onReset'
    ]);
  });

  it('copies and pastes the current selection through the board clipboard', (): void => {
    nanoidMock.mockReturnValueOnce('copy0001').mockReturnValueOnce('copy0002');
    const board = useWidgetBoard({
      elements: [createShapeElement('node-1', 10, 20), createShapeElement('node-2', 50, 70)],
      selection: ['node-1', 'node-2']
    });

    expect(board.hasClipboard.value).toBe(false);
    board.onCopySelection();
    board.onPasteClipboard({ x: 200, y: 300 });

    expect(board.hasClipboard.value).toBe(true);
    expect(board.state.value.elements.map((element: WidgetShapeElement): string => element.id)).toEqual(['node-1', 'node-2', 'copy0001', 'copy0002']);
    expect(board.state.value.elements[2]?.position).toEqual({ x: 200, y: 300 });
    expect(board.state.value.elements[3]?.position).toEqual({ x: 240, y: 350 });
    expect(board.state.value.selection).toEqual(['copy0001', 'copy0002']);
  });

  it('pastes a copied nested selection back into its direct parent', (): void => {
    nanoidMock.mockReturnValueOnce('copy0001');
    const groupElement: WidgetElementWithChildren = {
      ...createShapeElement('group-1', 100, 80),
      name: 'group',
      label: '组合',
      icon: 'lucide:group',
      title: '组合',
      children: [createShapeElement('child-1', 10, 20)]
    };
    const board = useWidgetBoard({
      elements: [groupElement],
      selection: ['child-1']
    });

    board.onCopySelection();
    board.onPasteClipboard({ x: 140, y: 130 });

    const group = board.state.value.elements[0] as WidgetElementWithChildren | undefined;
    expect(group?.children?.map((element: WidgetElement): string => element.id)).toEqual(['child-1', 'copy0001']);
    expect(group?.children?.[1]?.position).toEqual({ x: 40, y: 50 });
    expect(board.state.value.elements).toHaveLength(1);
    expect(board.state.value.selection).toEqual(['copy0001']);
  });

  it('pastes copied elements into the selected group container', (): void => {
    nanoidMock.mockReturnValueOnce('copy0001');
    const groupElement: WidgetElementWithChildren = {
      ...createShapeElement('group-1', 100, 80),
      name: 'group',
      label: '组合',
      icon: 'lucide:group',
      title: '组合',
      children: [createShapeElement('child-1', 10, 20)]
    };
    const board = useWidgetBoard({
      elements: [groupElement, createShapeElement('source-1', 0, 0)],
      selection: ['source-1']
    });

    board.onCopySelection();
    board.onSetSelection(['group-1']);
    board.onPasteClipboard({ x: 150, y: 130 });

    const group = board.state.value.elements[0] as WidgetElementWithChildren | undefined;
    expect(board.state.value.elements.map((element: WidgetElement): string => element.id)).toEqual(['group-1', 'source-1']);
    expect(group?.children?.map((element: WidgetElement): string => element.id)).toEqual(['child-1', 'copy0001']);
    expect(group?.children?.[1]?.position).toEqual({ x: 50, y: 50 });
    expect(board.state.value.selection).toEqual(['copy0001']);
  });

  it('keeps ancestor elements instead of descendants when normalizing selection', (): void => {
    const groupElement: WidgetElementWithChildren = {
      ...createShapeElement('group-1', 100, 80),
      name: 'group',
      label: '组合',
      icon: 'lucide:group',
      title: '组合',
      children: [createShapeElement('child-1', 10, 20)]
    };
    const board = useWidgetBoard({
      elements: [groupElement]
    });

    board.onSetSelection(['child-1', 'group-1']);

    expect(board.state.value.selection).toEqual(['group-1']);
  });

  it('creates nanoid element ids and type titles from current existing names', (): void => {
    nanoidMock.mockReturnValueOnce('rect0001').mockReturnValueOnce('rect0002').mockReturnValueOnce('rect0003').mockReturnValueOnce('text0001');
    const board = useWidgetBoard();

    board.onStartShapeDraft('rect', { x: 0, y: 0 });
    board.onCommitShapeDraft();
    board.onStartShapeDraft('rect', { x: 20, y: 20 });
    board.onCommitShapeDraft();
    board.onSetSelection(['rect0002']);
    board.onDeleteSelection();
    board.onStartShapeDraft('rect', { x: 40, y: 40 });
    board.onCommitShapeDraft();
    board.onStartShapeDraft('text', { x: 60, y: 60 });
    board.onCommitShapeDraft();

    expect(board.state.value.elements.map((element: WidgetShapeElement): string => element.id)).toEqual(['rect0001', 'rect0003', 'text0001']);
    expect(board.state.value.elements.map((element: WidgetShapeElement): string => element.title)).toEqual(['矩形1', '矩形2', '文本1']);
  });

  it('continues type titles from existing element titles', (): void => {
    nanoidMock.mockReturnValueOnce('rect0011');
    const existingElement = createShapeElement('existing-rect', 10, 20);
    existingElement.title = '矩形10';
    const board = useWidgetBoard({
      elements: [existingElement]
    });

    board.onStartShapeDraft('rect', { x: 40, y: 50 });
    board.onCommitShapeDraft();

    expect(board.state.value.elements[1]?.id).toBe('rect0011');
    expect(board.state.value.elements[1]?.title).toBe('矩形11');
  });

  it('continues type titles from nested element titles', (): void => {
    nanoidMock.mockReturnValueOnce('rect0009');
    const nestedElement = createShapeElement('nested-rect', 10, 20);
    nestedElement.title = '矩形8';
    const groupElement: WidgetElementWithChildren = {
      ...createShapeElement('group-1', 100, 80),
      name: 'group',
      label: '组合',
      icon: 'lucide:group',
      title: '组合',
      children: [nestedElement]
    };
    const board = useWidgetBoard({
      elements: [groupElement]
    });

    board.onStartShapeDraft('rect', { x: 40, y: 50 });
    board.onCommitShapeDraft();

    expect(board.state.value.elements[1]?.id).toBe('rect0009');
    expect(board.state.value.elements[1]?.title).toBe('矩形9');
  });

  it('groups, ungroups and reorders the current selection', (): void => {
    nanoidMock.mockReturnValueOnce('widget-group-1');
    const board = useWidgetBoard({
      elements: [
        createShapeElement('node-1', 10, 20),
        createShapeElement('node-2', 50, 70),
        createShapeElement('node-3', 90, 120),
        createShapeElement('node-4', 130, 170)
      ],
      selection: ['node-2', 'node-3']
    });

    board.onGroupSelection();
    const group = board.state.value.elements[1] as WidgetElementWithChildren | undefined;
    expect(group?.id).toBe('widget-group-1');
    expect(group?.name).toBe('group');
    expect(group?.children?.map((element: WidgetElement): string => element.id)).toEqual(['node-2', 'node-3']);

    board.onReorderSelection('bringToFront');
    expect(board.state.value.elements.map((element: WidgetShapeElement): string => element.id)).toEqual(['node-1', 'node-4', 'widget-group-1']);

    board.onSetSelection(['widget-group-1']);
    board.onUngroupSelection();
    expect(board.state.value.elements.map((element: WidgetShapeElement): string => element.id)).toEqual(['node-1', 'node-4', 'node-2', 'node-3']);
  });

  it('locks and unlocks the current selection through board history', (): void => {
    const groupElement: WidgetElementWithChildren = {
      ...createShapeElement('group-1', 100, 80),
      name: 'group',
      label: '组合',
      icon: 'lucide:group',
      title: '组合',
      children: [createShapeElement('child-1', 10, 20)]
    };
    const board = useWidgetBoard({
      elements: [groupElement],
      selection: ['child-1']
    });

    board.onSetSelectionLocked(true);

    const lockedChild = (board.state.value.elements[0] as WidgetElementWithChildren | undefined)?.children?.[0];
    expect(lockedChild?.locked).toBe(true);
    expect(board.state.value.selection).toEqual(['child-1']);
    expect(board.state.value.history.past).toHaveLength(1);

    board.onSetSelectionLocked(false);

    const unlockedChild = (board.state.value.elements[0] as WidgetElementWithChildren | undefined)?.children?.[0];
    expect(unlockedChild?.locked).toBeUndefined();
    expect(board.state.value.history.past).toHaveLength(2);
  });
});
