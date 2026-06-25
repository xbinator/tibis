/**
 * @file use-model-sync.test.ts
 * @description 验证 BDrawing 模型同步 hook 的双向绑定边界。
 */
import { effectScope, nextTick, ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { useDrawingBoard } from '@/components/BDrawing/hooks/useDrawingBoard';
import { useModelSync } from '@/components/BDrawing/hooks/useModelSync';
import type { DrawingData, DrawingElement, DrawingShapeElement } from '@/components/BDrawing/types';

/**
 * 创建测试形状元素。
 * @param id - 元素 ID
 * @returns 测试形状元素
 */
function createShapeElement(id: string): DrawingShapeElement {
  return {
    id,
    name: 'rect',
    text: '外部节点',
    position: { x: 24, y: 36 },
    size: { width: 180, height: 72 },
    rotation: 0,
    metadata: {
      source: 'user',
      createdAt: 1
    }
  };
}

/**
 * 创建测试画板数据。
 * @param id - 元素 ID
 * @returns 测试画板数据
 */
function createDrawingData(id: string): DrawingData {
  return {
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
    const emitted: DrawingData[] = [];

    scope.run((): void => {
      const board = useDrawingBoard(modelValue.value);
      useModelSync({
        board,
        emitUpdate: (value: DrawingData): void => {
          emitted.push(value);
        },
        modelValue
      });

      board.startCreateShapeDraft('rect', { x: 20, y: 30 });
      board.updateDraftPoint({ x: 140, y: 90 });
      board.commitCreateShapeDraft();
    });

    await nextTick();
    scope.stop();

    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.elements).toHaveLength(2);
    expect(Object.keys(emitted[0] ?? {}).sort()).toEqual(['elements', 'viewport']);
    expect('kind' in (emitted[0]?.elements[0] ?? {})).toBe(false);
    expect(emitted[0]?.elements[0]?.name).toBe('rect');
    expect('shape' in (emitted[0]?.elements[0] ?? {})).toBe(false);
    expect(hasInternalStateFields(emitted[0] as DrawingData)).toBe(false);
  });

  it('emits lightweight model data when only the viewport changes', async (): Promise<void> => {
    const scope = effectScope();
    const modelValue = ref<DrawingData | undefined>(createDrawingData('node-1'));
    const emitted: DrawingData[] = [];

    scope.run((): void => {
      const board = useDrawingBoard(modelValue.value);
      useModelSync({
        board,
        emitUpdate: (value: DrawingData): void => {
          emitted.push(value);
        },
        modelValue
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

    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.elements).toEqual(modelValue.value?.elements);
    expect(emitted[0]?.viewport).toEqual({ center: { x: 300, y: 240 }, zoom: 0.8 });
    expect(hasInternalStateFields(emitted[0] as DrawingData)).toBe(false);
  });

  it('uses the current board viewport when emitting content changes', async (): Promise<void> => {
    const scope = effectScope();
    const modelValue = ref<DrawingData | undefined>(createDrawingData('node-1'));
    const emitted: DrawingData[] = [];

    scope.run((): void => {
      const board = useDrawingBoard(modelValue.value);
      useModelSync({
        board,
        emitUpdate: (value: DrawingData): void => {
          emitted.push(value);
        },
        modelValue
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

    expect(emitted.at(-1)?.elements).toHaveLength(2);
    expect(emitted.at(-1)?.viewport).toEqual({ center: { x: 300, y: 240 }, zoom: 0.8 });
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
    const emitted: DrawingData[] = [];
    let readBoardElements: () => DrawingElement[] = (): DrawingElement[] => [];

    scope.run((): void => {
      const board = useDrawingBoard(modelValue.value);
      useModelSync({
        board,
        emitUpdate: (value: DrawingData): void => {
          emitted.push(value);
        },
        modelValue
      });

      modelValue.value = createDrawingData('node-2');
      readBoardElements = (): DrawingElement[] => board.state.value.elements;
    });

    await nextTick();
    scope.stop();

    expect(readBoardElements().map((element: DrawingElement): string => element.id)).toEqual(['node-2']);
    expect(emitted).toEqual([]);
  });
});
