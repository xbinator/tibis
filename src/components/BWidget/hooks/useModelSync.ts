/**
 * @file useModelSync.ts
 * @description BWidget 外部 v-model 与内部Widget状态同步。
 */
import type { WidgetBoardSnapshot, WidgetData, WidgetElement } from '../types';
import type { UseWidgetBoardReturn } from './useWidgetBoard';
import { nextTick, watch } from 'vue';
import type { Ref } from 'vue';
import { isEqual } from 'lodash-es';
import { createWidgetDataSnapshot } from '../utils/boardTransforms';

/**
 * 模型同步 hook 入参。
 */
export interface UseModelSyncOptions {
  /** 外部双向绑定数据 */
  dataItem: Ref<WidgetData | undefined>;
  /** 内部Widget状态与命令 */
  board: UseWidgetBoardReturn;
}

/**
 * 创建用于判断对外模型是否变化的轻量Widget快照。
 * @param snapshot - Widget快照或绑定数据
 * @returns 内容快照
 */
function createWidgetModelSnapshot(snapshot: Pick<WidgetBoardSnapshot, 'elements' | 'viewport'>): Pick<WidgetBoardSnapshot, 'elements' | 'viewport'> {
  return {
    elements: snapshot.elements,
    viewport: snapshot.viewport
  };
}

/**
 * 判断外部Widget内容与内部状态是否一致。
 * @param dataItem - 外部Widget数据
 * @param board - 内部Widget状态与命令
 * @returns 是否一致
 */
function isModelContentEqualToBoard(dataItem: WidgetData, board: UseWidgetBoardReturn): boolean {
  return isEqual(createWidgetModelSnapshot(dataItem), createWidgetModelSnapshot(board.state.value));
}

/**
 * 创建对外同步的Widget数据。
 * @param board - 内部Widget状态与命令
 * @param dataItem - 当前外部Widget数据
 * @returns 对外同步数据
 */
function createModelUpdateSnapshot(board: UseWidgetBoardReturn, dataItem: WidgetData | undefined): WidgetData {
  return createWidgetDataSnapshot(
    {
      ...board.state.value,
      name: dataItem?.name,
      description: dataItem?.description,
      inputSchema: dataItem?.inputSchema,
      dataSchema: dataItem?.dataSchema,
      metadata: dataItem?.metadata
    },
    {
      // Board state 已由交互层或状态变换层归一化，回写模型时避免按无上下文模板再次测量。
      normalizeSize: false
    }
  );
}

/**
 * 创建外部模型回灌到Widget时使用的快照，保留仍然存在的内部选区。
 * @param dataItem - 外部Widget数据
 * @param board - 内部Widget状态与命令
 * @returns Widget重置快照
 */
function createModelResetSnapshot(dataItem: WidgetData, board: UseWidgetBoardReturn): Partial<WidgetBoardSnapshot> {
  const modelElementIds = new Set(dataItem.elements.map((element: WidgetElement): string => element.id));

  return {
    ...dataItem,
    selection: board.state.value.selection.filter((elementId: string): boolean => modelElementIds.has(elementId))
  };
}

/**
 * 回写外部模型中的规格化Widget数据。
 * @param dataItem - 外部Widget数据
 * @param options - 模型同步配置
 */
function syncNormalizedBoardToModel(dataItem: WidgetData, options: UseModelSyncOptions): void {
  const normalizedData = createModelUpdateSnapshot(options.board, dataItem);
  if (isEqual(dataItem, normalizedData)) {
    return;
  }

  options.dataItem.value = normalizedData;
}

/**
 * 同步外部 v-model 与内部Widget状态。
 * @param options - 模型同步配置
 */
export function useModelSync(options: UseModelSyncOptions): void {
  let syncingDataItemToBoard = false;

  watch(
    () => options.dataItem.value,
    (dataItem: WidgetData | undefined): void => {
      if (!dataItem || isModelContentEqualToBoard(dataItem, options.board)) {
        return;
      }

      syncingDataItemToBoard = true;
      options.board.reset(createModelResetSnapshot(dataItem, options.board));
      syncNormalizedBoardToModel(dataItem, options);
      nextTick()
        .then((): void => {
          syncingDataItemToBoard = false;
        })
        .catch((error: unknown): void => {
          syncingDataItemToBoard = false;
          console.warn('BWidget model sync failed', error);
        });
    },
    { deep: true }
  );

  watch(
    () => [options.board.state.value.elements, options.board.state.value.viewport],
    (): void => {
      if (options.dataItem.value === undefined || syncingDataItemToBoard) {
        return;
      }

      if (isModelContentEqualToBoard(options.dataItem.value, options.board)) {
        return;
      }

      options.dataItem.value = createModelUpdateSnapshot(options.board, options.dataItem.value);
    },
    { deep: true }
  );
}
