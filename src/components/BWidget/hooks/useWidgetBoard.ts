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
import {
  findWidgetElementTreeNode,
  flattenWidgetElementTree,
  isSameWidgetElementParent,
  isWidgetGroupElement,
  normalizeWidgetElementSelection,
  type WidgetRenderTreeNode
} from '../utils/widgetTree';

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
  return flattenWidgetElementTree(elements).reduce<number>((maxIndex: number, item: WidgetRenderTreeNode): number => {
    const index = getElementTitleIndex(item.element, name, label);

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
  const clipboardParentId = ref<string | null>(null);
  /** 当前是否存在可粘贴元素。 */
  const hasClipboard = computed<boolean>(() => clipboard.value.length > 0);

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
    return createUniqueWidgetElementId(new Set(flattenWidgetElementTree(state.value.elements).map((item: WidgetRenderTreeNode): string => item.element.id)));
  }

  /**
   * 读取当前选区的直接父级。
   * @param selection - 选区元素 ID 列表
   * @returns 同父级选区的父级 ID，顶层为 null
   */
  function resolveSelectionParentId(selection: string[]): string | null {
    if (selection.length === 0 || !isSameWidgetElementParent(state.value.elements, selection)) {
      return null;
    }

    return findWidgetElementTreeNode(state.value.elements, selection[0])?.parentId ?? null;
  }

  /**
   * 读取当前选区粘贴时应使用的目标父级。
   * @param selection - 选区元素 ID 列表
   * @returns 粘贴目标父级 ID，顶层为 null
   */
  function resolveSelectionPasteParentId(selection: string[]): string | null {
    if (selection.length === 1) {
      const selectedNode = findWidgetElementTreeNode(state.value.elements, selection[0]);
      if (!selectedNode) {
        return null;
      }

      return isWidgetGroupElement(selectedNode.element) ? selectedNode.element.id : selectedNode.parentId;
    }

    return resolveSelectionParentId(selection);
  }

  /**
   * 读取本次粘贴的目标父级。
   * @returns 目标父级 ID，顶层为 null
   */
  function resolvePasteParentId(): string | null {
    const selectionParentId = state.value.selection.length > 0 ? resolveSelectionPasteParentId(state.value.selection) : clipboardParentId.value;
    if (selectionParentId && !findWidgetElementTreeNode(state.value.elements, selectionParentId)) {
      return null;
    }

    return selectionParentId;
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
    resizeElements: (changes: WidgetGeometryChange[]): void => {
      // MoveableLayer 已按当前渲染上下文归一化尺寸，避免纯模型层按模板源码二次测量。
      setState(resizeWidgetElements(state.value, changes, { normalizeSize: false }));
    },
    updateElementStyle: (elementId: string, style: WidgetElementStyleChange): void => setState(updateWidgetElementStyle(state.value, elementId, style)),
    deleteSelection: (): void => setState(deleteWidgetSelection(state.value)),
    copySelection: (): void => {
      clipboard.value = copyWidgetSelection(state.value);
      clipboardParentId.value = resolveSelectionParentId(state.value.selection);
    },
    pasteClipboard: (anchorPoint?: WidgetPoint): void => {
      if (!clipboard.value.length) {
        return;
      }

      const usedElementIds = new Set(flattenWidgetElementTree(state.value.elements).map((item: WidgetRenderTreeNode): string => item.element.id));
      const parentId = resolvePasteParentId();
      setState(
        pasteWidgetElements(state.value, clipboard.value, {
          anchorPoint,
          parentId,
          createElementId: (): string => {
            const id = createUniqueWidgetElementId(usedElementIds);
            usedElementIds.add(id);

            return id;
          }
        })
      );
    },
    groupSelection: (): void => setState(groupWidgetSelection(state.value, createWidgetElementId())),
    ungroupSelection: (): void => setState(ungroupWidgetSelection(state.value)),
    updateElementTitle: (elementId: string, title: string): void => setState(updateWidgetElementTitle(state.value, elementId, title)),
    reorderElement: (elementId: string, action: WidgetLayerAction): void => setState(reorderWidgetElement(state.value, elementId, action)),
    reorderSelection: (action: WidgetLayerAction): void => setState(reorderWidgetSelection(state.value, action)),
    setSelection: (selection: string[]): void => {
      state.value = { ...state.value, selection: normalizeWidgetElementSelection(state.value.elements, selection) };
    },
    reset: (nextSnapshot?: Partial<WidgetBoardSnapshot>): void => {
      setState(createWidgetBoardState(nextSnapshot));
    }
  };
}
