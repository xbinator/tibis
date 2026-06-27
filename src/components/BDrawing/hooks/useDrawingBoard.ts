/**
 * @file useDrawingBoard.ts
 * @description BDrawing 画板状态与命令封装。
 */
import type {
  DrawingBoardSnapshot,
  DrawingBoardState,
  DrawingElement,
  DrawingElementStyle,
  DrawingElementStyleChange,
  DrawingGeometryChange,
  DrawingLayerAction,
  DrawingPoint,
  DrawingShapeElement
} from '../types';
import { computed, ref } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import { escapeRegExp } from 'lodash-es';
import { nanoid } from 'nanoid';
import { getDrawingElementSchema } from '../elements';
import {
  addDrawingShape,
  copyDrawingSelection,
  createDrawingBoardState,
  deleteDrawingSelection,
  groupDrawingSelection,
  moveDrawingElements,
  pasteDrawingElements,
  redoDrawingBoard,
  reorderDrawingElement,
  reorderDrawingSelection,
  resizeDrawingElements,
  ungroupDrawingSelection,
  undoDrawingBoard,
  updateDrawingElementStyle,
  updateDrawingElementTitle
} from '../utils/boardTransforms';
import { getDrawingElementGroupId } from '../utils/drawingGroups';

/** BDrawing 新元素 ID 长度。 */
const DRAWING_ELEMENT_ID_SIZE = 8;

/**
 * 读取元素标题中的类型序号。
 * @param element - 画板元素
 * @param name - 元素注册名称
 * @param label - 元素类型展示名
 * @returns 标题序号，不匹配时返回 null
 */
function getElementTitleIndex(element: DrawingElement, name: string, label: string): number | null {
  if (element.name !== name) {
    return null;
  }

  const match = element.title.match(new RegExp(`^${escapeRegExp(label)}(\\d+)$`));
  if (!match) {
    return null;
  }

  const index = Number(match[1]);

  return Number.isSafeInteger(index) && index > 0 ? index : null;
}

/**
 * 读取现有标题中指定元素类型的最大序号。
 * @param elements - 画板元素列表
 * @param name - 元素注册名称
 * @param label - 元素类型展示名
 * @returns 最大标题序号
 */
function getMaxExistingElementTitleIndex(elements: DrawingElement[], name: string, label: string): number {
  return elements.reduce<number>((maxIndex: number, element: DrawingElement): number => {
    const index = getElementTitleIndex(element, name, label);

    return index === null ? maxIndex : Math.max(maxIndex, index);
  }, 0);
}

/**
 * 生成不与已有元素冲突的 nanoid。
 * @param existingIds - 已存在的元素 ID 集合
 * @returns 新元素 ID
 */
function createUniqueDrawingElementId(existingIds: Set<string>): string {
  let nextId = nanoid(DRAWING_ELEMENT_ID_SIZE);

  while (existingIds.has(nextId)) {
    nextId = nanoid(DRAWING_ELEMENT_ID_SIZE);
  }

  return nextId;
}

/**
 * 读取自动生成 ID 中的序号。
 * @param id - 元素 ID
 * @param prefix - 自动生成 ID 前缀
 * @returns 序号，不匹配时返回 null
 */
function getGeneratedElementIdIndex(id: string, prefix: string): number | null {
  if (!id.startsWith(prefix)) {
    return null;
  }

  const rawIndex = id.slice(prefix.length);
  if (!/^\d+$/.test(rawIndex)) {
    return null;
  }

  return Number(rawIndex);
}

/**
 * 读取已有组合中指定前缀的最大自动生成序号。
 * @param elements - 元素列表
 * @param prefix - 自动生成组合 ID 前缀
 * @returns 最大序号
 */
function getMaxGeneratedGroupIdIndex(elements: DrawingElement[], prefix: string): number {
  return elements.reduce<number>((maxIndex: number, element: DrawingElement): number => {
    const groupId = getDrawingElementGroupId(element);
    if (!groupId) {
      return maxIndex;
    }

    const index = getGeneratedElementIdIndex(groupId, prefix);

    return index === null ? maxIndex : Math.max(maxIndex, index);
  }, 0);
}

/**
 * BDrawing 画板 hook 返回值。
 */
export interface UseDrawingBoardReturn {
  /** 响应式画板状态 */
  state: Ref<DrawingBoardState>;
  /** 当前是否存在可粘贴元素 */
  hasClipboard: ComputedRef<boolean>;
  /** 开始创建形状草稿 */
  startCreateShapeDraft: (name: string, start: DrawingPoint) => void;
  /** 更新当前草稿坐标 */
  updateDraftPoint: (point: DrawingPoint) => void;
  /** 提交创建形状草稿 */
  commitCreateShapeDraft: (style?: DrawingElementStyle) => void;
  /** 清空交互草稿 */
  clearDraft: () => void;
  /** 撤销 */
  undo: () => void;
  /** 重做 */
  redo: () => void;
  /** 移动元素 */
  moveElements: (changes: DrawingGeometryChange[]) => void;
  /** 缩放元素 */
  resizeElements: (changes: DrawingGeometryChange[]) => void;
  /** 更新元素样式 */
  updateElementStyle: (elementId: string, style: DrawingElementStyleChange) => void;
  /** 删除选区 */
  deleteSelection: () => void;
  /** 复制选区 */
  copySelection: () => void;
  /** 粘贴剪贴板元素 */
  pasteClipboard: (anchorPoint?: DrawingPoint) => void;
  /** 合并选区为组合 */
  groupSelection: () => void;
  /** 取消选区命中的组合 */
  ungroupSelection: () => void;
  /** 更新元素自定义名称 */
  updateElementTitle: (elementId: string, title: string) => void;
  /** 调整元素层级 */
  reorderElement: (elementId: string, action: DrawingLayerAction) => void;
  /** 调整选区层级 */
  reorderSelection: (action: DrawingLayerAction) => void;
  /** 设置选区 */
  setSelection: (selection: string[]) => void;
  /** 重置画板状态 */
  reset: (snapshot?: Partial<DrawingBoardSnapshot>) => void;
}

/**
 * 创建画板状态 hook。
 * @param snapshot - 初始快照
 * @returns 画板 hook
 */
export function useDrawingBoard(snapshot?: Partial<DrawingBoardSnapshot>): UseDrawingBoardReturn {
  const state = ref<DrawingBoardState>(createDrawingBoardState(snapshot));
  const clipboard = ref<DrawingShapeElement[]>([]);
  let groupIndex = getMaxGeneratedGroupIdIndex(state.value.elements, 'drawing-group-');
  /** 当前是否存在可粘贴元素。 */
  const hasClipboard = computed<boolean>(() => clipboard.value.length > 0);

  /**
   * 按当前元素数量同步自动生成组合 ID 的起始序号。
   */
  function syncElementIndexes(): void {
    groupIndex = getMaxGeneratedGroupIdIndex(state.value.elements, 'drawing-group-');
  }

  /**
   * 更新画板状态。
   * @param nextState - 新状态
   */
  function setState(nextState: DrawingBoardState): void {
    state.value = nextState;
  }

  /**
   * 创建元素初始样式，临时创建样式优先覆盖 schema 默认样式。
   * @param schemaStyle - 元素注册默认样式
   * @param creationStyle - 创建时指定样式
   * @returns 合并后的初始样式
   */
  function createInitialElementStyle(schemaStyle: DrawingElementStyle | undefined, creationStyle: DrawingElementStyle | undefined): DrawingElementStyle {
    return { ...(schemaStyle ?? {}), ...(creationStyle ?? {}) };
  }

  /**
   * 创建不与当前画板元素冲突的新元素 ID。
   * @returns 新元素 ID
   */
  function createDrawingElementId(): string {
    return createUniqueDrawingElementId(new Set(state.value.elements.map((element: DrawingElement): string => element.id)));
  }

  /**
   * 创建新元素标题。
   * @param name - 元素注册名称
   * @param label - 元素类型展示名
   * @returns 新标题
   */
  function createElementTitle(name: string, label: string): string {
    const existingMaxIndex = getMaxExistingElementTitleIndex(state.value.elements, name, label);

    return `${label}${existingMaxIndex + 1}`;
  }

  return {
    state,
    hasClipboard,
    startCreateShapeDraft: (name: string, start: DrawingPoint): void => {
      state.value = {
        ...state.value,
        draft: {
          kind: 'creating-shape',
          name,
          start,
          current: start
        },
        selection: []
      };
    },
    updateDraftPoint: (point: DrawingPoint): void => {
      if (state.value.draft?.kind !== 'creating-shape') {
        return;
      }

      state.value = {
        ...state.value,
        draft: {
          ...state.value.draft,
          current: point
        }
      };
    },
    commitCreateShapeDraft: (style?: DrawingElementStyle): void => {
      const { draft } = state.value;
      if (draft?.kind !== 'creating-shape') {
        return;
      }

      const schema = getDrawingElementSchema(draft.name);
      if (!schema) {
        state.value = {
          ...state.value,
          draft: undefined,
          lastError: new Error(`找不到元素注册配置: ${draft.name}`)
        };
        return;
      }

      setState(
        addDrawingShape(
          {
            ...state.value,
            draft: undefined
          },
          {
            id: createDrawingElementId(),
            name: draft.name,
            label: schema.label,
            title: createElementTitle(draft.name, schema.label),
            icon: schema.icon,
            createAnchor: schema.createAnchor,
            start: draft.start,
            end: draft.current,
            style: createInitialElementStyle(schema.style, style),
            metadata: schema.metadata
          }
        )
      );
    },
    clearDraft: (): void => {
      state.value = {
        ...state.value,
        draft: undefined
      };
    },
    undo: (): void => setState(undoDrawingBoard(state.value)),
    redo: (): void => setState(redoDrawingBoard(state.value)),
    moveElements: (changes: DrawingGeometryChange[]): void => setState(moveDrawingElements(state.value, changes)),
    resizeElements: (changes: DrawingGeometryChange[]): void => setState(resizeDrawingElements(state.value, changes)),
    updateElementStyle: (elementId: string, style: DrawingElementStyleChange): void => setState(updateDrawingElementStyle(state.value, elementId, style)),
    deleteSelection: (): void => setState(deleteDrawingSelection(state.value)),
    copySelection: (): void => {
      clipboard.value = copyDrawingSelection(state.value);
    },
    pasteClipboard: (anchorPoint?: DrawingPoint): void => {
      if (!clipboard.value.length) {
        return;
      }

      const usedElementIds = new Set(state.value.elements.map((element: DrawingElement): string => element.id));
      setState(
        pasteDrawingElements(state.value, clipboard.value, {
          anchorPoint,
          createElementId: (): string => {
            const id = createUniqueDrawingElementId(usedElementIds);
            usedElementIds.add(id);

            return id;
          },
          createGroupId: (): string => `drawing-group-${++groupIndex}`
        })
      );
    },
    groupSelection: (): void => setState(groupDrawingSelection(state.value, `drawing-group-${++groupIndex}`)),
    ungroupSelection: (): void => setState(ungroupDrawingSelection(state.value)),
    updateElementTitle: (elementId: string, title: string): void => setState(updateDrawingElementTitle(state.value, elementId, title)),
    reorderElement: (elementId: string, action: DrawingLayerAction): void => setState(reorderDrawingElement(state.value, elementId, action)),
    reorderSelection: (action: DrawingLayerAction): void => setState(reorderDrawingSelection(state.value, action)),
    setSelection: (selection: string[]): void => {
      state.value = { ...state.value, selection };
    },
    reset: (nextSnapshot?: Partial<DrawingBoardSnapshot>): void => {
      setState(createDrawingBoardState(nextSnapshot));
      syncElementIndexes();
    }
  };
}
