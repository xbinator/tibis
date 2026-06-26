/**
 * @file useModelSync.ts
 * @description BDrawing 外部 v-model 与内部画板状态同步。
 */
import type { DrawingBoardSnapshot, DrawingData, DrawingElement } from '../types';
import type { UseDrawingBoardReturn } from './useDrawingBoard';
import { nextTick, watch } from 'vue';
import type { Ref } from 'vue';
import { isEqual } from 'lodash-es';
import { createDrawingDataSnapshot } from '../utils/boardTransforms';

/**
 * 模型同步 hook 入参。
 */
export interface UseModelSyncOptions {
  /** 外部双向绑定数据 */
  drawingData: Ref<DrawingData | undefined>;
  /** 内部画板状态与命令 */
  board: UseDrawingBoardReturn;
}

/**
 * 创建用于判断对外模型是否变化的轻量画板快照。
 * @param snapshot - 画板快照或绑定数据
 * @returns 内容快照
 */
function createDrawingModelSnapshot(snapshot: Pick<DrawingBoardSnapshot, 'elements' | 'viewport'>): Pick<DrawingBoardSnapshot, 'elements' | 'viewport'> {
  return {
    elements: snapshot.elements,
    viewport: snapshot.viewport
  };
}

/**
 * 判断外部画板内容与内部状态是否一致。
 * @param drawingData - 外部画板数据
 * @param board - 内部画板状态与命令
 * @returns 是否一致
 */
function isModelContentEqualToBoard(drawingData: DrawingData, board: UseDrawingBoardReturn): boolean {
  return isEqual(createDrawingModelSnapshot(drawingData), createDrawingModelSnapshot(board.state.value));
}

/**
 * 创建对外同步的画板数据。
 * @param board - 内部画板状态与命令
 * @param drawingData - 当前外部画板数据
 * @returns 对外同步数据
 */
function createModelUpdateSnapshot(board: UseDrawingBoardReturn, drawingData: DrawingData | undefined): DrawingData {
  return createDrawingDataSnapshot({
    ...board.state.value,
    metadata: drawingData?.metadata
  });
}

/**
 * 创建外部模型回灌到画板时使用的快照，保留仍然存在的内部选区。
 * @param drawingData - 外部画板数据
 * @param board - 内部画板状态与命令
 * @returns 画板重置快照
 */
function createModelResetSnapshot(drawingData: DrawingData, board: UseDrawingBoardReturn): Partial<DrawingBoardSnapshot> {
  const modelElementIds = new Set(drawingData.elements.map((element: DrawingElement): string => element.id));

  return {
    ...drawingData,
    selection: board.state.value.selection.filter((elementId: string): boolean => modelElementIds.has(elementId))
  };
}

/**
 * 同步外部 v-model 与内部画板状态。
 * @param options - 模型同步配置
 */
export function useModelSync(options: UseModelSyncOptions): void {
  let syncingDrawingDataToBoard = false;

  watch(
    () => options.drawingData.value,
    (drawingData: DrawingData | undefined): void => {
      if (!drawingData || isModelContentEqualToBoard(drawingData, options.board)) {
        return;
      }

      syncingDrawingDataToBoard = true;
      options.board.reset(createModelResetSnapshot(drawingData, options.board));
      nextTick()
        .then((): void => {
          syncingDrawingDataToBoard = false;
        })
        .catch((error: unknown): void => {
          syncingDrawingDataToBoard = false;
          console.warn('BDrawing model sync failed', error);
        });
    },
    { deep: true }
  );

  watch(
    () => [options.board.state.value.elements, options.board.state.value.viewport],
    (): void => {
      if (options.drawingData.value === undefined || syncingDrawingDataToBoard) {
        return;
      }

      if (isModelContentEqualToBoard(options.drawingData.value, options.board)) {
        return;
      }

      options.drawingData.value = createModelUpdateSnapshot(options.board, options.drawingData.value);
    },
    { deep: true }
  );
}
