/**
 * @file useModelSync.ts
 * @description BDrawing 外部 v-model 与内部画板状态同步。
 */
import type { DrawingData } from '../types';
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
  modelValue: Readonly<Ref<DrawingData | undefined>>;
  /** 内部画板状态与命令 */
  board: UseDrawingBoardReturn;
  /** 向外部发出画板数据更新 */
  emitUpdate: (value: DrawingData) => void;
}

/**
 * 判断外部画板数据与内部状态是否一致。
 * @param modelValue - 外部画板数据
 * @param board - 内部画板状态与命令
 * @returns 是否一致
 */
function isModelValueEqualToBoard(modelValue: DrawingData, board: UseDrawingBoardReturn): boolean {
  return isEqual(createDrawingDataSnapshot(modelValue), createDrawingDataSnapshot(board.state.value));
}

/**
 * 同步外部 v-model 与内部画板状态。
 * @param options - 模型同步配置
 */
export function useModelSync(options: UseModelSyncOptions): void {
  let syncingModelValueToBoard = false;

  watch(
    () => options.modelValue.value,
    (modelValue: DrawingData | undefined): void => {
      if (!modelValue || isModelValueEqualToBoard(modelValue, options.board)) {
        return;
      }

      syncingModelValueToBoard = true;
      options.board.reset(modelValue);
      nextTick()
        .then((): void => {
          syncingModelValueToBoard = false;
        })
        .catch((error: unknown): void => {
          syncingModelValueToBoard = false;
          console.warn('BDrawing model sync failed', error);
        });
    },
    { deep: true }
  );

  watch(
    () => [options.board.state.value.elements, options.board.state.value.edges, options.board.state.value.viewport],
    (): void => {
      if (options.modelValue.value === undefined || syncingModelValueToBoard) {
        return;
      }

      options.emitUpdate(createDrawingDataSnapshot(options.board.state.value));
    },
    { deep: true }
  );
}
