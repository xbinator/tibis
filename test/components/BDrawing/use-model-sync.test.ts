/**
 * @file use-model-sync.test.ts
 * @description 验证 BDrawing 模型同步 hook 的双向绑定边界。
 */
import { effectScope, nextTick, ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { useDrawingBoard } from '@/components/BDrawing/hooks/useDrawingBoard';
import { useModelSync } from '@/components/BDrawing/hooks/useModelSync';
import type { DrawingData, DrawingElement, DrawingShapeElement } from '@/components/BDrawing/types';
import { createDrawingDataSnapshot } from '@/components/BDrawing/utils/boardTransforms';

/**
 * 创建测试形状元素。
 * @param id - 元素 ID
 * @returns 测试形状元素
 */
function createShapeElement(id: string): DrawingShapeElement {
  return {
    id,
    name: 'rect',
    label: '矩形',
    icon: 'lucide:square',
    title: '外部节点',
    position: { x: 24, y: 36 },
    size: { width: 180, height: 72 },
    rotation: 0,
    style: {},
    metadata: {}
  };
}

/**
 * 创建测试画板数据。
 * @param id - 元素 ID
 * @returns 测试画板数据
 */
function createDrawingData(id: string): DrawingData {
  return {
    metadata: {},
    elements: [createShapeElement(id)],
    viewport: {
      center: { x: 10, y: 20 },
      zoom: 1
    }
  };
}

/**
 * 判断轻量绑定数据中是否暴露了内部状态字段。
 * @param value - 待检查的绑定数据
 * @returns 是否包含内部状态字段
 */
function hasInternalStateFields(value: DrawingData): boolean {
  return 'selection' in value || 'draft' in value || 'history' in value;
}

describe('useModelSync', (): void => {
  it('emits lightweight model data when board content changes', async (): Promise<void> => {
    const scope = effectScope();
    const modelValue = ref<DrawingData | undefined>(createDrawingData('node-1'));

    scope.run((): void => {
      const board = useDrawingBoard(modelValue.value);
      useModelSync({
        board,
        drawingData: modelValue
      });

      board.startCreateShapeDraft('rect', { x: 20, y: 30 });
      board.updateDraftPoint({ x: 140, y: 90 });
      board.commitCreateShapeDraft();
    });

    await nextTick();
    scope.stop();

    expect(modelValue.value?.elements).toHaveLength(2);
    expect(Object.keys(modelValue.value ?? {}).sort()).toEqual(['elements', 'metadata', 'viewport']);
    expect('kind' in (modelValue.value?.elements[0] ?? {})).toBe(false);
    expect(modelValue.value?.elements[0]?.name).toBe('rect');
    expect('shape' in (modelValue.value?.elements[0] ?? {})).toBe(false);
    expect(hasInternalStateFields(modelValue.value as DrawingData)).toBe(false);
  });

  it('normalizes old drawing data without metadata to an empty metadata object', async (): Promise<void> => {
    const scope = effectScope();
    const legacyData = {
      elements: [createShapeElement('node-1')],
      viewport: {
        center: { x: 10, y: 20 },
        zoom: 1
      }
    } as DrawingData;
    const modelValue = ref<DrawingData | undefined>(legacyData);
    let readBoardData: () => DrawingData = (): DrawingData => createDrawingData('fallback');

    scope.run((): void => {
      const board = useDrawingBoard(modelValue.value);
      useModelSync({
        board,
        drawingData: modelValue
      });

      readBoardData = (): DrawingData => createDrawingDataSnapshot(board.state.value);
    });

    await nextTick();
    scope.stop();

    expect(readBoardData().metadata).toEqual({});
  });

  it('preserves model metadata when emitting board content changes', async (): Promise<void> => {
    const scope = effectScope();
    const modelValue = ref<DrawingData | undefined>({
      ...createDrawingData('node-1'),
      metadata: {
        title: '流程图'
      }
    });

    scope.run((): void => {
      const board = useDrawingBoard(modelValue.value);
      useModelSync({
        board,
        drawingData: modelValue
      });

      board.startCreateShapeDraft('rect', { x: 20, y: 30 });
      board.updateDraftPoint({ x: 140, y: 90 });
      board.commitCreateShapeDraft();
    });

    await nextTick();
    scope.stop();

    expect(modelValue.value?.metadata).toEqual({ title: '流程图' });
  });

  it('emits lightweight model data when only the viewport changes', async (): Promise<void> => {
    const scope = effectScope();
    const modelValue = ref<DrawingData | undefined>(createDrawingData('node-1'));
    const initialElements = modelValue.value?.elements;

    scope.run((): void => {
      const board = useDrawingBoard(modelValue.value);
      useModelSync({
        board,
        drawingData: modelValue
      });

      board.state.value = {
        ...board.state.value,
        viewport: {
          center: { x: 300, y: 240 },
          zoom: 0.8
        }
      };
    });

    await nextTick();
    scope.stop();

    expect(modelValue.value?.elements).toEqual(initialElements);
    expect(modelValue.value?.viewport).toEqual({ center: { x: 300, y: 240 }, zoom: 0.8 });
    expect(hasInternalStateFields(modelValue.value as DrawingData)).toBe(false);
  });

  it('uses the current board viewport when emitting content changes', async (): Promise<void> => {
    const scope = effectScope();
    const modelValue = ref<DrawingData | undefined>(createDrawingData('node-1'));

    scope.run((): void => {
      const board = useDrawingBoard(modelValue.value);
      useModelSync({
        board,
        drawingData: modelValue
      });

      board.state.value = {
        ...board.state.value,
        viewport: {
          center: { x: 300, y: 240 },
          zoom: 0.8
        }
      };
      board.startCreateShapeDraft('rect', { x: 20, y: 30 });
      board.updateDraftPoint({ x: 140, y: 90 });
      board.commitCreateShapeDraft();
    });

    await nextTick();
    scope.stop();

    expect(modelValue.value?.elements).toHaveLength(2);
    expect(modelValue.value?.viewport).toEqual({ center: { x: 300, y: 240 }, zoom: 0.8 });
  });

  it('continues generated shape ids after the highest existing generated id', (): void => {
    const board = useDrawingBoard({
      elements: [createShapeElement('drawing-shape-2')]
    });

    board.startCreateShapeDraft('rect', { x: 20, y: 30 });
    board.updateDraftPoint({ x: 140, y: 90 });
    board.commitCreateShapeDraft();

    expect(board.state.value.elements.map((element: DrawingElement): string => element.id)).toEqual(['drawing-shape-2', 'drawing-shape-3']);
    expect(board.state.value.lastError).toBeUndefined();
  });

  it('resets board from external model without echoing the same update', async (): Promise<void> => {
    const scope = effectScope();
    const modelValue = ref<DrawingData | undefined>(createDrawingData('node-1'));
    let readBoardElements: () => DrawingElement[] = (): DrawingElement[] => [];

    scope.run((): void => {
      const board = useDrawingBoard(modelValue.value);
      useModelSync({
        board,
        drawingData: modelValue
      });

      modelValue.value = createDrawingData('node-2');
      readBoardElements = (): DrawingElement[] => board.state.value.elements;
    });

    await nextTick();
    scope.stop();

    expect(readBoardElements().map((element: DrawingElement): string => element.id)).toEqual(['node-2']);
    expect(modelValue.value?.elements.map((element: DrawingElement): string => element.id)).toEqual(['node-2']);
  });

  it('preserves selected ids that still exist when resetting from external model', async (): Promise<void> => {
    const scope = effectScope();
    const initialData = createDrawingData('node-1');
    const nextData = createDrawingData('node-1');
    const nextElement = nextData.elements[0];
    if (!nextElement) {
      throw new Error('测试数据缺少画图元素');
    }
    nextData.elements = [
      {
        ...nextElement,
        title: '外部更新节点'
      }
    ];
    const modelValue = ref<DrawingData | undefined>(initialData);
    let readBoardSelection: () => string[] = (): string[] => [];

    scope.run((): void => {
      const board = useDrawingBoard({
        ...initialData,
        selection: ['node-1']
      });
      useModelSync({
        board,
        drawingData: modelValue
      });

      modelValue.value = nextData;
      readBoardSelection = (): string[] => board.state.value.selection;
    });

    await nextTick();
    scope.stop();

    expect(readBoardSelection()).toEqual(['node-1']);
  });
});
