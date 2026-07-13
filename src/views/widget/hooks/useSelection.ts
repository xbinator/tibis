/**
 * @file useSelection.ts
 * @description Widget页面画布选区、侧栏高亮和设置目标同步逻辑。
 */
import type { ComputedRef, Ref } from 'vue';
import { computed, ref, watch } from 'vue';
import type { WidgetData, WidgetElement, WidgetSelectTarget } from '@/components/BWidget/types';
import { findElementTreeNode } from '@/components/BWidget/utils/widgetTree';
import type { UseFileSessionReturn } from '@/hooks/useFileSession';

/**
 * Widget选区 hook 入参。
 */
export interface UseSelectionOptions {
  /** 当前Widget文件会话 */
  session: UseFileSessionReturn<WidgetData>;
  /** 右侧设置面板宽度 */
  settingsWidth: Ref<number>;
}

/**
 * Widget选区状态命名空间。
 */
export interface SelectionState {
  /** 当前右侧设置栏可编辑目标 */
  selectedTarget: Ref<WidgetSelectTarget>;
  /** 当前侧栏需要高亮的元素 ID 列表 */
  selectedElementIds: Ref<string[]>;
  /** 当前侧栏需要额外高亮的组合子元素 ID */
  activeElementId: ComputedRef<string | null>;
}

/**
 * Widget选区操作命名空间。
 */
export interface SelectionHandlers {
  /** 处理Widget数据(value)回写，同步最新文档状态 */
  handleDataUpdate: (data: WidgetData) => void;
  /** 处理Widget内部编辑目标(target)更新 */
  handleSelectUpdate: (target: WidgetSelectTarget) => void;
  /** 处理Widget内部选区(selection)同步 */
  handleSelectionUpdate: (selection: string[]) => void;
}

/**
 * Widget选区 hook 返回值（扁平结构）。
 */
export interface UseSelectionReturn {
  /** 当前右侧设置栏可编辑目标 */
  selectedTarget: Ref<WidgetSelectTarget>;
  /** 当前侧栏需要高亮的元素 ID 列表 */
  selectedElementIds: Ref<string[]>;
  /** 当前侧栏需要额外高亮的组合子元素 ID */
  activeElementId: ComputedRef<string | null>;
  /** 处理Widget数据(value)回写，同步最新文档状态 */
  onDataUpdate: (data: WidgetData) => void;
  /** 处理Widget内部编辑目标(target)更新 */
  onSelectUpdate: (target: WidgetSelectTarget) => void;
  /** 处理Widget内部选区(selection)同步 */
  onSelectionUpdate: (selection: string[]) => void;
}

/**
 * 判断当前设置目标是否为Widget元素。
 * @param target - 当前设置目标
 * @returns 是否为Widget元素
 */
export function isWidgetElementTarget(target: WidgetSelectTarget): target is WidgetElement {
  return Boolean(target && typeof target === 'object' && 'id' in target);
}

/**
 * 创建Widget页面选区同步逻辑。
 * @param options - hook 入参
 * @returns 选区同步状态和处理器
 */
export function useSelection(options: UseSelectionOptions): UseSelectionReturn {
  const { session, settingsWidth } = options;
  const selectedTarget = ref<WidgetSelectTarget>(session.data.value.metadata);
  const selectedElementIds = ref<string[]>([]);
  const activeElementId = computed<string | null>(() => {
    if (!isWidgetElementTarget(selectedTarget.value)) {
      return null;
    }

    return findElementTreeNode(session.data.value.elements, selectedTarget.value.id)?.parentId ? selectedTarget.value.id : null;
  });

  /**
   * 根据当前设置目标同步侧栏高亮选区。
   * @param target - 当前设置目标
   */
  function syncSidebarSelectedElementIds(target: WidgetSelectTarget): void {
    if (isWidgetElementTarget(target)) {
      selectedElementIds.value = [target.id];
      return;
    }

    if (target !== null) {
      selectedElementIds.value = [];
    }
  }

  /**
   * 根据最新元素树刷新当前设置面板选中目标。
   */
  function syncSelectedTargetFromElementTree(): void {
    if (!isWidgetElementTarget(selectedTarget.value)) {
      return;
    }

    const nextElement = findElementTreeNode(session.data.value.elements, selectedTarget.value.id)?.element;
    selectedTarget.value = nextElement ?? session.data.value.metadata;
  }

  /**
   * 根据Widget内部选区同步当前设置目标，避免模型回写时序让非空选区退回页面配置。
   * @param selection - Widget内部选区 ID 列表
   */
  function syncSelectedTargetFromSelection(selection: string[]): void {
    if (selection.length === 0) {
      selectedTarget.value = session.data.value.metadata;
      return;
    }

    if (selection.length !== 1) {
      return;
    }

    const selectedId = selection[0];
    const selectedElement = selectedId ? findElementTreeNode(session.data.value.elements, selectedId)?.element : null;
    if (selectedElement) {
      selectedTarget.value = selectedElement;
    }
  }

  /**
   * 判断Widget回传的设置目标是否为可能过期的页面配置目标。
   * @param target - Widget回传的设置目标
   * @returns 是否应忽略本次目标更新
   */
  function shouldIgnoreSelectUpdate(target: WidgetSelectTarget): boolean {
    return selectedElementIds.value.length > 0 && target !== null && !isWidgetElementTarget(target);
  }

  /**
   * 处理Widget数据(value)回写，并同步设置目标与选区状态。
   * @param data - 最新Widget文档数据
   */
  function handleDataUpdate(data: WidgetData): void {
    session.data.value = data;
    syncSelectedTargetFromElementTree();
    syncSelectedTargetFromSelection(selectedElementIds.value);
  }

  /**
   * 处理Widget编辑目标(target)更新，写入设置面板当前编辑对象。
   * @param target - 最新编辑目标（页面配置或某个元素）
   */
  function handleSelectUpdate(target: WidgetSelectTarget): void {
    if (shouldIgnoreSelectUpdate(target)) {
      return;
    }

    selectedTarget.value = target;
  }

  /**
   * 处理Widget选区(selection)变更，同步选中元素列表与编辑目标。
   * @param selection - 当前Widget选区元素 ID 列表
   */
  function handleSelectionUpdate(selection: string[]): void {
    selectedElementIds.value = [...selection];
    syncSelectedTargetFromSelection(selection);

    if (settingsWidth.value === 0 && selectedElementIds.value.length) {
      settingsWidth.value = 300;
    }
  }

  watch(selectedTarget, syncSidebarSelectedElementIds, { immediate: true });
  watch(() => session.data.value.elements, syncSelectedTargetFromElementTree, { deep: true });

  return {
    selectedTarget,
    selectedElementIds,
    activeElementId,
    onDataUpdate: handleDataUpdate,
    onSelectUpdate: handleSelectUpdate,
    onSelectionUpdate: handleSelectionUpdate
  };
}
