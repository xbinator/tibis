/**
 * @file useSelection.ts
 * @description Widget页面画布选区、侧栏高亮和设置目标同步逻辑。
 */
import type { ComputedRef, Ref } from 'vue';
import { computed, ref, watch } from 'vue';
import type { WidgetData, WidgetElement, WidgetSelectTarget } from '@/components/BWidget/types';
import { findWidgetElementTreeNode } from '@/components/BWidget/utils/widgetTree';
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
 * Widget选区 hook 返回值。
 */
export interface UseSelectionReturn {
  /** 当前右侧设置栏可编辑目标 */
  selectedTarget: Ref<WidgetSelectTarget>;
  /** 当前侧栏需要高亮的元素 ID 列表 */
  selectedElementIds: Ref<string[]>;
  /** 当前侧栏需要额外高亮的组合子元素 ID */
  activeSidebarElementId: ComputedRef<string | null>;
  /** 处理Widget内部数据更新 */
  handleWidgetDataUpdate: (data: WidgetData) => void;
  /** 处理Widget内部设置目标更新 */
  handleWidgetSelectUpdate: (target: WidgetSelectTarget) => void;
  /** 处理Widget内部选区同步 */
  handleWidgetSelectionChange: (selection: string[]) => void;
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
  const activeSidebarElementId = computed<string | null>(() => {
    if (!isWidgetElementTarget(selectedTarget.value)) {
      return null;
    }

    return findWidgetElementTreeNode(session.data.value.elements, selectedTarget.value.id)?.parentId ? selectedTarget.value.id : null;
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

    const nextElement = findWidgetElementTreeNode(session.data.value.elements, selectedTarget.value.id)?.element;
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
    const selectedElement = selectedId ? findWidgetElementTreeNode(session.data.value.elements, selectedId)?.element : null;
    if (selectedElement) {
      selectedTarget.value = selectedElement;
    }
  }

  /**
   * 判断Widget回传的设置目标是否为可能过期的页面配置目标。
   * @param target - Widget回传的设置目标
   * @returns 是否应忽略本次目标更新
   */
  function shouldIgnoreWidgetSelectUpdate(target: WidgetSelectTarget): boolean {
    return selectedElementIds.value.length > 0 && target !== null && !isWidgetElementTarget(target);
  }

  /**
   * 处理Widget内部数据更新。
   * @param data - 最新Widget数据
   */
  function handleWidgetDataUpdate(data: WidgetData): void {
    session.data.value = data;
    syncSelectedTargetFromElementTree();
    syncSelectedTargetFromSelection(selectedElementIds.value);
  }

  /**
   * 处理Widget内部设置目标更新。
   * @param target - 最新设置目标
   */
  function handleWidgetSelectUpdate(target: WidgetSelectTarget): void {
    if (shouldIgnoreWidgetSelectUpdate(target)) {
      return;
    }

    selectedTarget.value = target;
  }

  /**
   * 处理Widget内部选区同步。
   * @param selection - 当前Widget选区 ID 列表
   */
  function handleWidgetSelectionChange(selection: string[]): void {
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
    activeSidebarElementId,
    handleWidgetDataUpdate,
    handleWidgetSelectUpdate,
    handleWidgetSelectionChange
  };
}
