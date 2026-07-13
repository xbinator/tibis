/**
 * @file useWidgetBoard.ts
 * @description BWidget Widget状态与命令封装。
 */
import type {
  WidgetBoardSnapshot,
  WidgetBoardState,
  WidgetElement,
  WidgetElementStyle,
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
  reorderWidgetSelection,
  resizeWidgetElements,
  setWidgetSelectionLocked,
  ungroupWidgetSelection,
  undoWidgetBoard,
  updateWidgetElementTitle
} from '../utils/boardTransforms';
import {
  findElementTreeNode,
  flattenWidgetElementTree,
  isSameParent,
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
function getMaxTitleIndex(elements: WidgetElement[], name: string, label: string): number {
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
function createUniqueElementId(existingIds: Set<string>): string {
  let nextId = nanoid(WIDGET_ELEMENT_ID_SIZE);

  while (existingIds.has(nextId)) {
    nextId = nanoid(WIDGET_ELEMENT_ID_SIZE);
  }

  return nextId;
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
 * 读取选区的直接父级。
 * @param elements - 当前元素树
 * @param selection - 选区元素 ID 列表
 * @returns 同父级选区的父级 ID，顶层为 null
 */
function resolveSelectionParent(elements: WidgetElement[], selection: string[]): string | null {
  if (selection.length === 0 || !isSameParent(elements, selection)) {
    return null;
  }

  return findElementTreeNode(elements, selection[0])?.parentId ?? null;
}

/**
 * 读取剪贴板粘贴目标父级。
 * @param elements - 当前元素树
 * @param selection - 当前选区元素 ID 列表
 * @param clipboardParentId - 复制来源父级 ID
 * @returns 粘贴目标父级 ID，顶层为 null
 */
function resolvePasteParent(elements: WidgetElement[], selection: string[], clipboardParentId: string | null): string | null {
  let parentId = clipboardParentId;
  if (selection.length === 1) {
    const selectedNode = findElementTreeNode(elements, selection[0]);
    parentId = selectedNode && isWidgetGroupElement(selectedNode.element) ? selectedNode.element.id : selectedNode?.parentId ?? null;
  } else if (selection.length > 1) {
    parentId = resolveSelectionParent(elements, selection);
  }

  return parentId && !findElementTreeNode(elements, parentId) ? null : parentId;
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
  onStartShapeDraft: (name: string, start: WidgetPoint) => void;
  /** 更新当前草稿坐标 */
  onUpdateDraftPoint: (point: WidgetPoint) => void;
  /** 提交创建形状草稿 */
  onCommitShapeDraft: (style?: WidgetElementStyle) => void;
  /** 清空交互草稿 */
  onClearDraft: () => void;
  /** 撤销 */
  onUndo: () => void;
  /** 重做 */
  onRedo: () => void;
  /** 移动元素 */
  onMoveElements: (changes: WidgetGeometryChange[]) => void;
  /** 缩放元素 */
  onResizeElements: (changes: WidgetGeometryChange[]) => void;
  /** 删除选区 */
  onDeleteSelection: () => void;
  /** 复制选区 */
  onCopySelection: () => void;
  /** 粘贴剪贴板元素 */
  onPasteClipboard: (anchorPoint?: WidgetPoint) => void;
  /** 合并选区为组合 */
  onGroupSelection: () => void;
  /** 取消选区命中的组合 */
  onUngroupSelection: () => void;
  /** 更新元素自定义名称 */
  onUpdateElementTitle: (elementId: string, title: string) => void;
  /** 调整选区层级 */
  onReorderSelection: (action: WidgetLayerAction) => void;
  /** 设置选区位置尺寸锁定状态 */
  onSetSelectionLocked: (locked: boolean) => void;
  /** 设置选区 */
  onSetSelection: (selection: string[]) => void;
  /** 重置Widget状态 */
  onReset: (snapshot?: Partial<WidgetBoardSnapshot>) => void;
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
   * 创建不与当前Widget元素冲突的新元素 ID。
   * @returns 新元素 ID
   */
  function createElementId(): string {
    const existingIds = new Set(flattenWidgetElementTree(state.value.elements).map((item: WidgetRenderTreeNode): string => item.element.id));

    return createUniqueElementId(existingIds);
  }

  /**
   * 创建新元素标题。
   * @param name - 元素注册名称
   * @param label - 元素类型展示名
   * @returns 新标题
   */
  function createElementTitle(name: string, label: string): string {
    const existingMaxIndex = getMaxTitleIndex(state.value.elements, name, label);

    return `${label}${existingMaxIndex + 1}`;
  }

  /**
   * 开始创建形状草稿。
   * @param name - 元素注册名称
   * @param start - 草稿起点
   */
  function onStartShapeDraft(name: string, start: WidgetPoint): void {
    setState({
      ...state.value,
      draft: {
        kind: 'creating-shape',
        name,
        start,
        current: start
      },
      selection: []
    });
  }

  /**
   * 更新当前草稿坐标。
   * @param point - 最新草稿坐标
   */
  function onUpdateDraftPoint(point: WidgetPoint): void {
    if (state.value.draft?.kind !== 'creating-shape') {
      return;
    }

    setState({
      ...state.value,
      draft: {
        ...state.value.draft,
        current: point
      }
    });
  }

  /**
   * 提交创建形状草稿。
   * @param style - 创建时覆盖的元素样式
   */
  function onCommitShapeDraft(style?: WidgetElementStyle): void {
    const { draft } = state.value;
    if (draft?.kind !== 'creating-shape') {
      return;
    }

    const schema = getWidgetElementSchema(draft.name);
    if (!schema) {
      setState({
        ...state.value,
        draft: undefined,
        lastError: new Error(`找不到元素注册配置: ${draft.name}`)
      });
      return;
    }

    setState(
      addWidgetShape(
        {
          ...state.value,
          draft: undefined
        },
        {
          id: createElementId(),
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
  }

  /** 清空交互草稿。 */
  function onClearDraft(): void {
    setState({
      ...state.value,
      draft: undefined
    });
  }

  /** 撤销最近一次操作。 */
  function onUndo(): void {
    setState(undoWidgetBoard(state.value));
  }

  /** 重做最近一次撤销。 */
  function onRedo(): void {
    setState(redoWidgetBoard(state.value));
  }

  /**
   * 移动元素。
   * @param changes - 元素位置变更
   */
  function onMoveElements(changes: WidgetGeometryChange[]): void {
    setState(moveWidgetElements(state.value, changes));
  }

  /**
   * 缩放元素。
   * @param changes - 元素尺寸变更
   */
  function onResizeElements(changes: WidgetGeometryChange[]): void {
    // MoveableLayer 已按当前渲染上下文归一化尺寸，避免纯模型层按模板源码二次测量。
    setState(resizeWidgetElements(state.value, changes, { normalizeSize: false }));
  }

  /** 删除当前选区。 */
  function onDeleteSelection(): void {
    setState(deleteWidgetSelection(state.value));
  }

  /** 复制当前选区。 */
  function onCopySelection(): void {
    clipboard.value = copyWidgetSelection(state.value);
    clipboardParentId.value = resolveSelectionParent(state.value.elements, state.value.selection);
  }

  /**
   * 粘贴剪贴板元素。
   * @param anchorPoint - 粘贴锚点
   */
  function onPasteClipboard(anchorPoint?: WidgetPoint): void {
    if (clipboard.value.length === 0) {
      return;
    }

    const usedElementIds = new Set(flattenWidgetElementTree(state.value.elements).map((item: WidgetRenderTreeNode): string => item.element.id));
    const parentId = resolvePasteParent(state.value.elements, state.value.selection, clipboardParentId.value);

    setState(
      pasteWidgetElements(state.value, clipboard.value, {
        anchorPoint,
        parentId,
        createElementId: (): string => {
          const id = createUniqueElementId(usedElementIds);
          usedElementIds.add(id);

          return id;
        }
      })
    );
  }

  /** 合并当前选区。 */
  function onGroupSelection(): void {
    setState(groupWidgetSelection(state.value, createElementId()));
  }

  /** 取消当前选区中的组合。 */
  function onUngroupSelection(): void {
    setState(ungroupWidgetSelection(state.value));
  }

  /**
   * 更新元素标题。
   * @param elementId - 元素 ID
   * @param title - 最新标题
   */
  function onUpdateElementTitle(elementId: string, title: string): void {
    setState(updateWidgetElementTitle(state.value, elementId, title));
  }

  /**
   * 调整当前选区层级。
   * @param action - 层级操作
   */
  function onReorderSelection(action: WidgetLayerAction): void {
    setState(reorderWidgetSelection(state.value, action));
  }

  /**
   * 设置当前选区锁定状态。
   * @param locked - 是否锁定位置和尺寸
   */
  function onSetSelectionLocked(locked: boolean): void {
    setState(setWidgetSelectionLocked(state.value, locked));
  }

  /**
   * 设置当前选区。
   * @param selection - 元素 ID 列表
   */
  function onSetSelection(selection: string[]): void {
    setState({
      ...state.value,
      selection: normalizeWidgetElementSelection(state.value.elements, selection)
    });
  }

  /**
   * 重置Widget状态。
   * @param nextSnapshot - 最新Widget快照
   */
  function onReset(nextSnapshot?: Partial<WidgetBoardSnapshot>): void {
    setState(createWidgetBoardState(nextSnapshot));
  }

  return {
    state,
    hasClipboard,
    onStartShapeDraft,
    onUpdateDraftPoint,
    onCommitShapeDraft,
    onClearDraft,
    onUndo,
    onRedo,
    onMoveElements,
    onResizeElements,
    onDeleteSelection,
    onCopySelection,
    onPasteClipboard,
    onGroupSelection,
    onUngroupSelection,
    onUpdateElementTitle,
    onReorderSelection,
    onSetSelectionLocked,
    onSetSelection,
    onReset
  };
}
