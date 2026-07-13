/**
 * @file use-model-sync.test.ts
 * @description 验证 BWidget 模型同步 hook 的双向绑定边界。
 */
import { effectScope, nextTick, ref, toRaw } from 'vue';
import { describe, expect, it } from 'vitest';
import { useModelSync } from '@/components/BWidget/hooks/useModelSync';
import { useWidgetBoard } from '@/components/BWidget/hooks/useWidgetBoard';
import type { WidgetData, WidgetElement, WidgetShapeElement, WidgetViewport } from '@/components/BWidget/types';
import { createDefaultWidgetData } from '@/components/BWidget/utils/widgetData';
import { createDefaultWidgetElementLoopConfig } from '@/components/BWidget/utils/widgetLoop';

/**
 * 带可选子元素字段的测试元素。
 */
type WidgetElementWithChildren = WidgetShapeElement & {
  /** 子元素列表 */
  children?: WidgetElement[];
};

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
    loop: createDefaultWidgetElementLoopConfig(),
    metadata: {}
  };
}

/**
 * 创建测试组合元素。
 * @param id - 组合 ID
 * @param children - 子元素列表
 * @returns 测试组合元素
 */
function createGroupElement(id: string, children: WidgetElement[]): WidgetElementWithChildren {
  return {
    ...createShapeElement(id),
    name: 'group',
    label: '组合',
    icon: 'lucide:group',
    title: '组合',
    children
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
    loop: createDefaultWidgetElementLoopConfig(),
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
    elements: [createShapeElement(id)]
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

      board.onStartShapeDraft('rect', { x: 20, y: 30 });
      board.onUpdateDraftPoint({ x: 140, y: 90 });
      board.onCommitShapeDraft();
    });

    await nextTick();
    scope.stop();

    expect(modelValue.value?.elements).toHaveLength(2);
    expect(Object.keys(modelValue.value ?? {}).sort()).toEqual([
      'dataSchema',
      'description',
      'elements',
      'execute',
      'inputSchema',
      'metadata',
      'name',
      'outputSchema'
    ]);
    expect('kind' in (modelValue.value?.elements[0] ?? {})).toBe(false);
    expect(modelValue.value?.elements[0]?.name).toBe('rect');
    expect('shape' in (modelValue.value?.elements[0] ?? {})).toBe(false);
    expect(hasInternalStateFields(modelValue.value as WidgetData)).toBe(false);
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

      board.onStartShapeDraft('rect', { x: 20, y: 30 });
      board.onUpdateDraftPoint({ x: 140, y: 90 });
      board.onCommitShapeDraft();
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
          summary: {
            type: 'string',
            description: '摘要'
          }
        },
        required: ['summary']
      },
      dataSchema: {
        type: 'object',
        properties: {}
      }
    });

    scope.run((): void => {
      const board = useWidgetBoard(modelValue.value);
      useModelSync({
        board,
        dataItem: modelValue
      });

      board.onStartShapeDraft('rect', { x: 20, y: 30 });
      board.onUpdateDraftPoint({ x: 140, y: 90 });
      board.onCommitShapeDraft();
    });

    await nextTick();
    scope.stop();

    expect(modelValue.value?.name).toBe('profile_card');
    expect(modelValue.value?.description).toBe('生成个人资料卡片');
    expect(modelValue.value?.inputSchema.required).toEqual(['userName']);
    expect(modelValue.value?.outputSchema).toEqual({
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: '摘要'
        }
      },
      required: ['summary']
    });
    expect(hasInternalStateFields(modelValue.value as WidgetData)).toBe(false);
  });

  it('preserves widget execute config when emitting board content changes', async (): Promise<void> => {
    const scope = effectScope();
    const modelValue = ref<WidgetData | undefined>({
      ...createWidgetData('node-1'),
      execute: {
        enabled: false,
        description: '保存脚本配置',
        code: 'export default class ProfileCard extends Widget { submit() { this.$sendMessage("ok") } }'
      }
    });

    scope.run((): void => {
      const board = useWidgetBoard(modelValue.value);
      useModelSync({
        board,
        dataItem: modelValue
      });

      board.onStartShapeDraft('rect', { x: 20, y: 30 });
      board.onUpdateDraftPoint({ x: 140, y: 90 });
      board.onCommitShapeDraft();
    });

    await nextTick();
    scope.stop();

    expect(modelValue.value?.execute).toEqual({
      enabled: false,
      description: '保存脚本配置',
      code: 'export default class ProfileCard extends Widget { submit() { this.$sendMessage("ok") } }'
    });
    expect(hasInternalStateFields(modelValue.value as WidgetData)).toBe(false);
  });

  it('does not emit model data when only the viewport changes', async (): Promise<void> => {
    const scope = effectScope();
    const modelValue = ref<WidgetData | undefined>(createWidgetData('node-1'));
    const initialModel = modelValue.value;

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

    expect(modelValue.value).toBe(initialModel);
  });

  it('omits the current board viewport when emitting content changes', async (): Promise<void> => {
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
      board.onStartShapeDraft('rect', { x: 20, y: 30 });
      board.onUpdateDraftPoint({ x: 140, y: 90 });
      board.onCommitShapeDraft();
    });

    await nextTick();
    scope.stop();

    expect(modelValue.value?.elements).toHaveLength(2);
    expect(modelValue.value).not.toHaveProperty('viewport');
  });

  it('preserves current board viewport when external model edits existing elements', async (): Promise<void> => {
    const scope = effectScope();
    const initialData: WidgetData = {
      ...createDefaultWidgetData(),
      elements: [createTextElement('text-1', 'abc')]
    };
    const initialElement = initialData.elements[0];
    if (!initialElement) {
      throw new Error('测试数据缺少文本元素');
    }
    const editedData: WidgetData = {
      ...initialData,
      elements: [
        {
          ...initialElement,
          metadata: {
            ...initialElement.metadata,
            content: 'abcdef'
          }
        }
      ]
    };
    const viewport: WidgetViewport = {
      center: { x: 300, y: 240 },
      zoom: 0.8
    };
    const modelValue = ref<WidgetData | undefined>(initialData);
    let readBoardViewport: () => WidgetViewport = (): WidgetViewport => ({ center: { x: 0, y: 0 }, zoom: 1 });

    scope.run((): void => {
      const board = useWidgetBoard(modelValue.value);
      board.state.value = {
        ...board.state.value,
        viewport
      };
      useModelSync({
        board,
        dataItem: modelValue
      });

      modelValue.value = editedData;
      readBoardViewport = (): WidgetViewport => board.state.value.viewport;
    });

    await nextTick();
    scope.stop();

    expect(readBoardViewport()).toEqual(viewport);
  });

  it('continues generated shape titles from current existing titles', (): void => {
    const existingElement = createShapeElement('existing-rect');
    existingElement.title = '矩形8';
    const board = useWidgetBoard({
      elements: [existingElement]
    });

    board.onStartShapeDraft('rect', { x: 20, y: 30 });
    board.onUpdateDraftPoint({ x: 140, y: 90 });
    board.onCommitShapeDraft();

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

  it('records an in-place external element edit for undo and redo', async (): Promise<void> => {
    const scope = effectScope();
    const modelValue = ref<WidgetData | undefined>(createWidgetData('node-1'));
    let readHistory = (): { past: number; future: number } => ({ past: -1, future: -1 });
    let undo = (): void => undefined;
    let redo = (): void => undefined;

    scope.run((): void => {
      const board = useWidgetBoard(modelValue.value);
      useModelSync({ board, dataItem: modelValue });
      readHistory = (): { past: number; future: number } => ({
        past: board.state.value.history.past.length,
        future: board.state.value.history.future.length
      });
      undo = board.onUndo;
      redo = board.onRedo;
    });

    const element = modelValue.value?.elements[0];
    if (!element) {
      throw new Error('测试数据缺少Widget元素');
    }
    element.title = '属性面板更新';
    await nextTick();

    expect(readHistory()).toEqual({ past: 1, future: 0 });
    undo();
    await nextTick();
    expect(modelValue.value?.elements[0]?.title).toBe('外部节点');
    expect(readHistory()).toEqual({ past: 0, future: 1 });

    redo();
    await nextTick();
    expect(modelValue.value?.elements[0]?.title).toBe('属性面板更新');
    scope.stop();
  });

  it('clears existing history when the external model root is replaced', async (): Promise<void> => {
    const scope = effectScope();
    const modelValue = ref<WidgetData | undefined>(createWidgetData('node-1'));
    let readPastLength = (): number => -1;

    scope.run((): void => {
      const board = useWidgetBoard(modelValue.value);
      useModelSync({ board, dataItem: modelValue });
      board.onUpdateElementTitle('node-1', '画布更新');
      readPastLength = (): number => board.state.value.history.past.length;
    });

    await nextTick();
    expect(readPastLength()).toBe(1);
    modelValue.value = createWidgetData('node-2');
    await nextTick();

    expect(readPastLength()).toBe(0);
    scope.stop();
  });

  it('keeps history when code editing replaces the model root', async (): Promise<void> => {
    const scope = effectScope();
    const modelValue = ref<WidgetData | undefined>(createWidgetData('node-1'));
    let readHistory = (): { past: number; future: number } => ({ past: -1, future: -1 });
    let undo = (): void => undefined;

    scope.run((): void => {
      const board = useWidgetBoard(modelValue.value);
      useModelSync({ board, dataItem: modelValue });
      board.onUpdateElementTitle('node-1', '画布更新');
      readHistory = (): { past: number; future: number } => ({
        past: board.state.value.history.past.length,
        future: board.state.value.history.future.length
      });
      undo = board.onUndo;
    });

    await nextTick();
    expect(readHistory()).toEqual({ past: 1, future: 0 });
    const currentData = modelValue.value;
    if (!currentData) {
      throw new Error('测试数据缺少Widget模型');
    }
    modelValue.value = {
      ...currentData,
      execute: {
        ...currentData.execute,
        code: 'return { updated: true }'
      }
    };
    await nextTick();

    expect(readHistory()).toEqual({ past: 1, future: 0 });
    undo();
    await nextTick();
    expect(modelValue.value?.elements[0]?.title).toBe('外部节点');
    expect(modelValue.value?.execute.code).toBe('return { updated: true }');
    scope.stop();
  });

  it('does not echo model data when the external model is replaced during file loading', async (): Promise<void> => {
    const scope = effectScope();
    const initialData = createDefaultWidgetData();
    const loadedData: WidgetData = {
      ...createDefaultWidgetData(),
      elements: [createShapeElement('loaded-node-1')]
    };
    const modelValue = ref<WidgetData | undefined>(initialData);
    let readBoardElements: () => WidgetElement[] = (): WidgetElement[] => [];

    scope.run((): void => {
      const board = useWidgetBoard(modelValue.value);
      useModelSync({
        board,
        dataItem: modelValue
      });

      modelValue.value = loadedData;
      readBoardElements = (): WidgetElement[] => board.state.value.elements;
    });

    await nextTick();
    await nextTick();
    scope.stop();

    expect(toRaw(modelValue.value)).toBe(loadedData);
    expect(readBoardElements()[0]?.id).toBe('loaded-node-1');
    expect(readBoardElements()[0]?.name).toBe('rect');
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

  it('preserves nested selected ids that still exist when resetting from external model', async (): Promise<void> => {
    const scope = effectScope();
    const initialData: WidgetData = {
      ...createDefaultWidgetData(),
      elements: [createGroupElement('group-1', [createShapeElement('child-1')])]
    };
    const nextData: WidgetData = {
      ...initialData,
      elements: [createGroupElement('group-1', [{ ...createShapeElement('child-1'), title: '外部更新子节点' }])]
    };
    const modelValue = ref<WidgetData | undefined>(initialData);
    let readBoardSelection: () => string[] = (): string[] => [];

    scope.run((): void => {
      const board = useWidgetBoard({
        ...initialData,
        selection: ['child-1']
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

    expect(readBoardSelection()).toEqual(['child-1']);
  });

  it('raises text model height after external content changes require more wrapped height', async (): Promise<void> => {
    const scope = effectScope();
    const modelValue = ref<WidgetData | undefined>({
      ...createDefaultWidgetData(),
      elements: [createTextElement('text-1', 'abc')]
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
