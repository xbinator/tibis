/**
 * @file useModelSync.ts
 * @description BWidget 外部 v-model 与内部Widget状态同步。
 */
import type { WidgetBoardSnapshot, WidgetData } from '../types';
import type { UseWidgetBoardReturn } from './useWidgetBoard';
import { nextTick, toRaw, watch } from 'vue';
import type { Ref } from 'vue';
import { isEqual } from 'lodash-es';
import { createWidgetDataSnapshot, replaceWidgetElements } from '../utils/boardTransforms';
import { flattenWidgetElementTree } from '../utils/widgetTree';

/**
 * 模型同步 hook 入参。
 */
export interface UseModelSyncOptions {
  /** 外部双向绑定数据 */
  dataItem: Ref<WidgetData | undefined>;
  /** 内部Widget状态与命令 */
  board: UseWidgetBoardReturn;
  /** 外部模型重置内部Widget状态后的回调 */
  onExternalModelReset?: (dataItem: WidgetData) => void;
}

/**
 * 创建用于判断对外模型是否变化的轻量Widget快照。
 * @param snapshot - Widget快照或绑定数据
 * @returns 内容快照
 */
function createWidgetModelSnapshot(snapshot: Pick<WidgetBoardSnapshot, 'elements'>): Pick<WidgetBoardSnapshot, 'elements'> {
  return {
    elements: snapshot.elements
  };
}

/**
 * 判断外部Widget内容与内部状态是否一致。
 * @param dataItem - 外部Widget数据
 * @param board - 内部Widget状态与命令
 * @returns 是否一致
 */
function isModelContentEqual(dataItem: WidgetData, board: UseWidgetBoardReturn): boolean {
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
      outputSchema: dataItem?.outputSchema,
      dataSchema: dataItem?.dataSchema,
      execute: dataItem?.execute,
      metadata: dataItem?.metadata
    },
    {
      // Board state 已由交互层或状态变换层归一化，回写模型时避免按无上下文模板再次测量。
      normalizeSize: false
    }
  );
}

/**
 * 创建外部模型回灌到Widget时使用的快照，保留内部视口与仍然存在的内部选区。
 * @param dataItem - 外部Widget数据
 * @param board - 内部Widget状态与命令
 * @returns Widget重置快照
 */
function createModelResetSnapshot(dataItem: WidgetData, board: UseWidgetBoardReturn): Partial<WidgetBoardSnapshot> {
  const modelElementIds = new Set(flattenWidgetElementTree(dataItem.elements).map((item): string => item.element.id));

  return {
    ...dataItem,
    viewport: {
      center: { ...board.state.value.viewport.center },
      zoom: board.state.value.viewport.zoom
    },
    selection: board.state.value.selection.filter((elementId: string): boolean => modelElementIds.has(elementId))
  };
}

/**
 * 创建需要回写的规格化Widget数据。
 * @param dataItem - 外部Widget数据
 * @param options - 模型同步配置
 * @returns 需要回写的数据，无变化时返回 null
 */
function createNormalizedUpdate(dataItem: WidgetData, options: UseModelSyncOptions): WidgetData | null {
  const normalizedData = createModelUpdateSnapshot(options.board, dataItem);

  return isEqual(dataItem, normalizedData) ? null : normalizedData;
}

/**
 * 判断模型变化是否为当前对象的深层编辑。
 * @param dataItem - 最新外部模型
 * @param previousDataItem - 变化前外部模型
 * @returns 是否为同一文档对象内编辑
 */
function isNestedModelEdit(dataItem: WidgetData, previousDataItem: WidgetData | undefined): boolean {
  return dataItem === previousDataItem;
}

/**
 * 同步外部 v-model 与内部Widget状态。
 * @param options - 模型同步配置
 */
export function useModelSync(options: UseModelSyncOptions): void {
  let syncingDataItemToBoard = false;
  const boardModelUpdates = new WeakSet<object>();

  /**
   * 回写由 Board 产生的外部模型。
   * @param dataItem - 最新外部模型
   */
  function writeModelUpdate(dataItem: WidgetData): void {
    boardModelUpdates.add(toRaw(dataItem));
    options.dataItem.value = dataItem;
  }

  /**
   * 消费由 Board 产生的模型回写标记。
   * @param dataItem - 最新外部模型
   * @returns 是否为 Board 自身回写
   */
  function takeBoardModelUpdate(dataItem: WidgetData): boolean {
    const rawDataItem = toRaw(dataItem);
    if (!boardModelUpdates.has(rawDataItem)) {
      return false;
    }

    boardModelUpdates.delete(rawDataItem);
    return true;
  }

  watch(
    () => options.dataItem.value,
    (dataItem: WidgetData | undefined, previousDataItem: WidgetData | undefined): void => {
      if (!dataItem || takeBoardModelUpdate(dataItem)) {
        return;
      }

      const nestedEdit = isNestedModelEdit(dataItem, previousDataItem);
      if (isModelContentEqual(dataItem, options.board)) {
        return;
      }

      syncingDataItemToBoard = true;
      if (nestedEdit) {
        options.board.state.value = replaceWidgetElements(options.board.state.value, dataItem.elements);
      } else {
        options.board.onReset(createModelResetSnapshot(dataItem, options.board));
        options.onExternalModelReset?.(dataItem);
      }
      if (nestedEdit) {
        const normalizedData = createNormalizedUpdate(dataItem, options);
        if (normalizedData) {
          writeModelUpdate(normalizedData);
        }
      }
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
    () => options.board.state.value.elements,
    (): void => {
      if (options.dataItem.value === undefined || syncingDataItemToBoard) {
        return;
      }

      if (isModelContentEqual(options.dataItem.value, options.board)) {
        return;
      }

      writeModelUpdate(createModelUpdateSnapshot(options.board, options.dataItem.value));
    },
    { deep: true }
  );
}
