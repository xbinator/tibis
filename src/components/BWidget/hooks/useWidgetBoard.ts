/**
 * @file useWidgetBoard.ts
 * @description BWidget Widget状态与命令封装。
 */
import type {
  WidgetBoardSnapshot,
  WidgetBoardState,
  WidgetElement,
  WidgetElementStyle,
  WidgetElementStyleChange,
  WidgetGeometryChange,
  WidgetLayerAction,
  WidgetPoint,
  WidgetShapeElement
} from '../types';
import { computed, ref } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import { escapeRegExp } from 'lodash-es';
import { nanoid } from 'nanoid';
import { getWidgetElementSchema } from '../elements';
import {
  addWidgetShape,
  copyWidgetSelection,
  createWidgetBoardState,
  deleteWidgetSelection,
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
} from '../utils/boardTransforms';
import { getWidgetElementGroupId } from '../utils/widgetGroups';

/** BWidget 新元素 ID 长度。 */
const WIDGET_ELEMENT_ID_SIZE = 8;

/**
 * 读取元素标题中的类型序号。
 * @param element - Widget元素
 * @param name - 元素注册名称
 * @param label - 元素类型展示名
 * @returns 标题序号，不匹配时返回 null
 */
function getElementTitleIndex(element: WidgetElement, name: string, label: string): number | null {
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
 * @param elements - Widget元素列表
 * @param name - 元素注册名称
 * @param label - 元素类型展示名
 * @returns 最大标题序号
 */
function getMaxExistingElementTitleIndex(elements: WidgetElement[], name: string, label: string): number {
  return elements.reduce<number>((maxIndex: number, element: WidgetElement): number => {
    const index = getElementTitleIndex(element, name, label);

    return index === null ? maxIndex : Math.max(maxIndex, index);
  }, 0);
}

/**
 * 生成不与已有元素冲突的 nanoid。
 * @param existingIds - 已存在的元素 ID 集合
 * @returns 新元素 ID
 */
function createUniqueWidgetElementId(existingIds: Set<string>): string {
  let nextId = nanoid(WIDGET_ELEMENT_ID_SIZE);

  while (existingIds.has(nextId)) {
    nextId = nanoid(WIDGET_ELEMENT_ID_SIZE);
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
function getMaxGeneratedGroupIdIndex(elements: WidgetElement[], prefix: string): number {
  return elements.reduce<number>((maxIndex: number, element: WidgetElement): number => {
    const groupId = getWidgetElementGroupId(element);
    if (!groupId) {
      return maxIndex;
    }

    const index = getGeneratedElementIdIndex(groupId, prefix);

    return index === null ? maxIndex : Math.max(maxIndex, index);
  }, 0);
}

/**
 * BWidget Widget hook 返回值。
 */
export interface UseWidgetBoardReturn {
  /** 响应式Widget状态 */
  state: Ref<WidgetBoardState>;
  /** 当前是否存在可粘贴元素 */
  hasClipboard: ComputedRef<boolean>;
  /** 开始创建形状草稿 */
  startCreateShapeDraft: (name: string, start: WidgetPoint) => void;
  /** 更新当前草稿坐标 */
  updateDraftPoint: (point: WidgetPoint) => void;
  /** 提交创建形状草稿 */
  commitCreateShapeDraft: (style?: WidgetElementStyle) => void;
  /** 清空交互草稿 */
  clearDraft: () => void;
  /** 撤销 */
  undo: () => void;
  /** 重做 */
  redo: () => void;
  /** 移动元素 */
  moveElements: (changes: WidgetGeometryChange[]) => void;
  /** 缩放元素 */
  resizeElements: (changes: WidgetGeometryChange[]) => void;
  /** 更新元素样式 */
  updateElementStyle: (elementId: string, style: WidgetElementStyleChange) => void;
  /** 删除选区 */
  deleteSelection: () => void;
  /** 复制选区 */
  copySelection: () => void;
  /** 粘贴剪贴板元素 */
  pasteClipboard: (anchorPoint?: WidgetPoint) => void;
  /** 合并选区为组合 */
  groupSelection: () => void;
  /** 取消选区命中的组合 */
  ungroupSelection: () => void;
  /** 更新元素自定义名称 */
  updateElementTitle: (elementId: string, title: string) => void;
  /** 调整元素层级 */
  reorderElement: (elementId: string, action: WidgetLayerAction) => void;
  /** 调整选区层级 */
  reorderSelection: (action: WidgetLayerAction) => void;
  /** 设置选区 */
  setSelection: (selection: string[]) => void;
  /** 重置Widget状态 */
  reset: (snapshot?: Partial<WidgetBoardSnapshot>) => void;
}

/**
 * 创建Widget状态 hook。
 * @param snapshot - 初始快照
 * @returns Widget hook
 */
export function useWidgetBoard(snapshot?: Partial<WidgetBoardSnapshot>): UseWidgetBoardReturn {
  const state = ref<WidgetBoardState>(createWidgetBoardState(snapshot));
  const clipboard = ref<WidgetShapeElement[]>([]);
  let groupIndex = getMaxGeneratedGroupIdIndex(state.value.elements, 'widget-group-');
  /** 当前是否存在可粘贴元素。 */
  const hasClipboard = computed<boolean>(() => clipboard.value.length > 0);

  /**
   * 按当前元素数量同步自动生成组合 ID 的起始序号。
   */
  function syncElementIndexes(): void {
    groupIndex = getMaxGeneratedGroupIdIndex(state.value.elements, 'widget-group-');
  }

  /**
   * 更新Widget状态。
   * @param nextState - 新状态
   */
  function setState(nextState: WidgetBoardState): void {
    state.value = nextState;
  }

  /**
   * 创建元素初始样式，临时创建样式优先覆盖 schema 默认样式。
   * @param schemaStyle - 元素注册默认样式
   * @param creationStyle - 创建时指定样式
   * @returns 合并后的初始样式
   */
  function createInitialElementStyle(schemaStyle: WidgetElementStyle | undefined, creationStyle: WidgetElementStyle | undefined): WidgetElementStyle {
    return { ...(schemaStyle ?? {}), ...(creationStyle ?? {}) };
  }

  /**
   * 创建不与当前Widget元素冲突的新元素 ID。
   * @returns 新元素 ID
   */
  function createWidgetElementId(): string {
    return createUniqueWidgetElementId(new Set(state.value.elements.map((element: WidgetElement): string => element.id)));
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
    startCreateShapeDraft: (name: string, start: WidgetPoint): void => {
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
    updateDraftPoint: (point: WidgetPoint): void => {
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
    commitCreateShapeDraft: (style?: WidgetElementStyle): void => {
      const { draft } = state.value;
      if (draft?.kind !== 'creating-shape') {
        return;
      }

      const schema = getWidgetElementSchema(draft.name);
      if (!schema) {
        state.value = {
          ...state.value,
          draft: undefined,
          lastError: new Error(`找不到元素注册配置: ${draft.name}`)
        };
        return;
      }

      setState(
        addWidgetShape(
          {
            ...state.value,
            draft: undefined
          },
          {
            id: createWidgetElementId(),
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
    undo: (): void => setState(undoWidgetBoard(state.value)),
    redo: (): void => setState(redoWidgetBoard(state.value)),
    moveElements: (changes: WidgetGeometryChange[]): void => setState(moveWidgetElements(state.value, changes)),
    resizeElements: (changes: WidgetGeometryChange[]): void => setState(resizeWidgetElements(state.value, changes)),
    updateElementStyle: (elementId: string, style: WidgetElementStyleChange): void => setState(updateWidgetElementStyle(state.value, elementId, style)),
    deleteSelection: (): void => setState(deleteWidgetSelection(state.value)),
    copySelection: (): void => {
      clipboard.value = copyWidgetSelection(state.value);
    },
    pasteClipboard: (anchorPoint?: WidgetPoint): void => {
      if (!clipboard.value.length) {
        return;
      }

      const usedElementIds = new Set(state.value.elements.map((element: WidgetElement): string => element.id));
      setState(
        pasteWidgetElements(state.value, clipboard.value, {
          anchorPoint,
          createElementId: (): string => {
            const id = createUniqueWidgetElementId(usedElementIds);
            usedElementIds.add(id);

            return id;
          },
          createGroupId: (): string => `widget-group-${++groupIndex}`
        })
      );
    },
    groupSelection: (): void => setState(groupWidgetSelection(state.value, `widget-group-${++groupIndex}`)),
    ungroupSelection: (): void => setState(ungroupWidgetSelection(state.value)),
    updateElementTitle: (elementId: string, title: string): void => setState(updateWidgetElementTitle(state.value, elementId, title)),
    reorderElement: (elementId: string, action: WidgetLayerAction): void => setState(reorderWidgetElement(state.value, elementId, action)),
    reorderSelection: (action: WidgetLayerAction): void => setState(reorderWidgetSelection(state.value, action)),
    setSelection: (selection: string[]): void => {
      state.value = { ...state.value, selection };
    },
    reset: (nextSnapshot?: Partial<WidgetBoardSnapshot>): void => {
      setState(createWidgetBoardState(nextSnapshot));
      syncElementIndexes();
    }
  };
}
