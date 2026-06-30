/**
 * @file use-model-sync.test.ts
 * @description 验证 BWidget 模型同步 hook 的双向绑定边界。
 */
import { effectScope, nextTick, ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { useModelSync } from '@/components/BWidget/hooks/useModelSync';
import { useWidgetBoard } from '@/components/BWidget/hooks/useWidgetBoard';
import type { WidgetData, WidgetElement, WidgetShapeElement } from '@/components/BWidget/types';
import { createWidgetDataSnapshot } from '@/components/BWidget/utils/boardTransforms';
import { createDefaultWidgetData } from '@/components/BWidget/utils/widgetData';

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
    title: '外部节点',
    position: { x: 24, y: 36 },
    size: { width: 180, height: 72 },
    rotation: 0,
    style: {},
    metadata: {}
  };
}

/**
 * 创建文本元素测试数据。
 * @param id - 元素 ID
 * @param content - 文本正文
 * @returns 文本元素
 */
function createTextElement(id: string, content: string): WidgetShapeElement {
  return {
    id,
    name: 'text',
    label: '文本',
    icon: 'lucide:type',
    title: '文本',
    position: { x: 24, y: 36 },
    size: { width: 30, height: 17.5 },
    rotation: 0,
    style: { fontSize: 10 },
    metadata: { content }
  };
}

/**
 * 创建测试Widget 数据。
 * @param id - 元素 ID
 * @returns 测试Widget 数据
 */
function createWidgetData(id: string): WidgetData {
  return {
    ...createDefaultWidgetData(),
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
function hasInternalStateFields(value: WidgetData): boolean {
  return 'selection' in value || 'draft' in value || 'history' in value;
}

describe('useModelSync', (): void => {
  it('emits lightweight model data when board content changes', async (): Promise<void> => {
    const scope = effectScope();
    const modelValue = ref<WidgetData | undefined>(createWidgetData('node-1'));

    scope.run((): void => {
      const board = useWidgetBoard(modelValue.value);
      useModelSync({
        board,
        dataItem: modelValue
      });

      board.startCreateShapeDraft('rect', { x: 20, y: 30 });
      board.updateDraftPoint({ x: 140, y: 90 });
      board.commitCreateShapeDraft();
    });

    await nextTick();
    scope.stop();

    expect(modelValue.value?.elements).toHaveLength(2);
    expect(Object.keys(modelValue.value ?? {}).sort()).toEqual([
      'description',
      'elements',
      'inputSchema',
      'metadata',
      'name',
      'outputSchema',
      'stateSchema',
      'viewport'
    ]);
    expect('kind' in (modelValue.value?.elements[0] ?? {})).toBe(false);
    expect(modelValue.value?.elements[0]?.name).toBe('rect');
    expect('shape' in (modelValue.value?.elements[0] ?? {})).toBe(false);
    expect(hasInternalStateFields(modelValue.value as WidgetData)).toBe(false);
  });

  it('normalizes old widget data without metadata to an empty metadata object', async (): Promise<void> => {
    const scope = effectScope();
    const legacyData = {
      elements: [createShapeElement('node-1')],
      viewport: {
        center: { x: 10, y: 20 },
        zoom: 1
      }
    } as WidgetData;
    const modelValue = ref<WidgetData | undefined>(legacyData);
    let readBoardData: () => WidgetData = (): WidgetData => createWidgetData('fallback');

    scope.run((): void => {
      const board = useWidgetBoard(modelValue.value);
      useModelSync({
        board,
        dataItem: modelValue
      });

      readBoardData = (): WidgetData => createWidgetDataSnapshot(board.state.value);
    });

    await nextTick();
    scope.stop();

    expect(readBoardData().metadata).toEqual({});
  });

  it('preserves model metadata when emitting board content changes', async (): Promise<void> => {
    const scope = effectScope();
    const modelValue = ref<WidgetData | undefined>({
      ...createWidgetData('node-1'),
      metadata: {
        title: '流程图'
      }
    });

    scope.run((): void => {
      const board = useWidgetBoard(modelValue.value);
      useModelSync({
        board,
        dataItem: modelValue
      });

      board.startCreateShapeDraft('rect', { x: 20, y: 30 });
      board.updateDraftPoint({ x: 140, y: 90 });
      board.commitCreateShapeDraft();
    });

    await nextTick();
    scope.stop();

    expect(modelValue.value?.metadata).toEqual({ title: '流程图' });
  });

  it('preserves widget data contract fields when emitting board content changes', async (): Promise<void> => {
    const scope = effectScope();
    const modelValue = ref<WidgetData | undefined>({
      ...createWidgetData('node-1'),
      name: 'profile_card',
      description: '生成个人资料卡片',
      inputSchema: {
        type: 'object',
        properties: {
          userName: {
            type: 'string',
            description: '用户姓名'
          }
        },
        required: ['userName']
      },
      outputSchema: {
        type: 'object',
        properties: {
          widgetId: {
            type: 'string',
            description: 'Widget ID'
          }
        },
        required: ['widgetId']
      }
    });

    scope.run((): void => {
      const board = useWidgetBoard(modelValue.value);
      useModelSync({
        board,
        dataItem: modelValue
      });

      board.startCreateShapeDraft('rect', { x: 20, y: 30 });
      board.updateDraftPoint({ x: 140, y: 90 });
      board.commitCreateShapeDraft();
    });

    await nextTick();
    scope.stop();

    expect(modelValue.value?.name).toBe('profile_card');
    expect(modelValue.value?.description).toBe('生成个人资料卡片');
    expect(modelValue.value?.inputSchema.required).toEqual(['userName']);
    expect(modelValue.value?.outputSchema.required).toEqual(['widgetId']);
    expect(hasInternalStateFields(modelValue.value as WidgetData)).toBe(false);
  });

  it('emits lightweight model data when only the viewport changes', async (): Promise<void> => {
    const scope = effectScope();
    const modelValue = ref<WidgetData | undefined>(createWidgetData('node-1'));
    const initialElements = modelValue.value?.elements;

    scope.run((): void => {
      const board = useWidgetBoard(modelValue.value);
      useModelSync({
        board,
        dataItem: modelValue
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
    expect(hasInternalStateFields(modelValue.value as WidgetData)).toBe(false);
  });

  it('uses the current board viewport when emitting content changes', async (): Promise<void> => {
    const scope = effectScope();
    const modelValue = ref<WidgetData | undefined>(createWidgetData('node-1'));

    scope.run((): void => {
      const board = useWidgetBoard(modelValue.value);
      useModelSync({
        board,
        dataItem: modelValue
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

  it('continues generated shape titles from current existing titles', (): void => {
    const existingElement = createShapeElement('existing-rect');
    existingElement.title = '矩形8';
    const board = useWidgetBoard({
      elements: [existingElement]
    });

    board.startCreateShapeDraft('rect', { x: 20, y: 30 });
    board.updateDraftPoint({ x: 140, y: 90 });
    board.commitCreateShapeDraft();

    expect(board.state.value.elements[1]?.id).toMatch(/^[A-Za-z0-9_-]{8}$/);
    expect(board.state.value.elements[1]?.title).toBe('矩形9');
    expect(board.state.value.lastError).toBeUndefined();
  });

  it('resets board from external model without echoing the same update', async (): Promise<void> => {
    const scope = effectScope();
    const modelValue = ref<WidgetData | undefined>(createWidgetData('node-1'));
    let readBoardElements: () => WidgetElement[] = (): WidgetElement[] => [];

    scope.run((): void => {
      const board = useWidgetBoard(modelValue.value);
      useModelSync({
        board,
        dataItem: modelValue
      });

      modelValue.value = createWidgetData('node-2');
      readBoardElements = (): WidgetElement[] => board.state.value.elements;
    });

    await nextTick();
    scope.stop();

    expect(readBoardElements().map((element: WidgetElement): string => element.id)).toEqual(['node-2']);
    expect(modelValue.value?.elements.map((element: WidgetElement): string => element.id)).toEqual(['node-2']);
  });

  it('preserves selected ids that still exist when resetting from external model', async (): Promise<void> => {
    const scope = effectScope();
    const initialData = createWidgetData('node-1');
    const nextData = createWidgetData('node-1');
    const nextElement = nextData.elements[0];
    if (!nextElement) {
      throw new Error('测试数据缺少Widget 元素');
    }
    nextData.elements = [
      {
        ...nextElement,
        title: '外部更新节点'
      }
    ];
    const modelValue = ref<WidgetData | undefined>(initialData);
    let readBoardSelection: () => string[] = (): string[] => [];

    scope.run((): void => {
      const board = useWidgetBoard({
        ...initialData,
        selection: ['node-1']
      });
      useModelSync({
        board,
        dataItem: modelValue
      });

      modelValue.value = nextData;
      readBoardSelection = (): string[] => board.state.value.selection;
    });

    await nextTick();
    scope.stop();

    expect(readBoardSelection()).toEqual(['node-1']);
  });

  it('raises text model height after external content changes require more wrapped height', async (): Promise<void> => {
    const scope = effectScope();
    const modelValue = ref<WidgetData | undefined>({
      ...createDefaultWidgetData(),
      elements: [createTextElement('text-1', 'abc')],
      viewport: {
        center: { x: 10, y: 20 },
        zoom: 1
      }
    });

    scope.run((): void => {
      const board = useWidgetBoard(modelValue.value);
      useModelSync({
        board,
        dataItem: modelValue
      });

      const element = modelValue.value?.elements[0];
      if (!element) {
        throw new Error('测试数据缺少文本元素');
      }

      element.metadata = {
        ...element.metadata,
        content: 'abcdef'
      };
    });

    await nextTick();
    await nextTick();
    scope.stop();

    expect(modelValue.value?.elements[0]?.size).toEqual({ width: 30, height: 31 });
  });
});
