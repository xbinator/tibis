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
  modelValue: Readonly<Ref<DrawingData | undefined>>;
  /** 内部画板状态与命令 */
  board: UseDrawingBoardReturn;
  /** 向外部发出画板数据更新 */
  emitUpdate: (value: DrawingData) => void;
}

/**
 * 创建用于判断内容是否变化的画板快照。
 * @param snapshot - 画板快照或绑定数据
 * @returns 内容快照
 */
function createDrawingContentSnapshot(snapshot: Pick<DrawingBoardSnapshot, 'elements'>): { elements: DrawingElement[] } {
  return {
    elements: snapshot.elements
  };
}

/**
 * 判断外部画板内容与内部状态是否一致。
 * @param modelValue - 外部画板数据
 * @param board - 内部画板状态与命令
 * @returns 是否一致
 */
function isModelContentEqualToBoard(modelValue: DrawingData, board: UseDrawingBoardReturn): boolean {
  return isEqual(createDrawingContentSnapshot(modelValue), createDrawingContentSnapshot(board.state.value));
}

/**
 * 创建对外同步的画板数据，保留外部已有视口快照。
 * @param board - 内部画板状态与命令
 * @param modelValue - 外部画板数据
 * @returns 对外同步数据
 */
function createModelUpdateSnapshot(board: UseDrawingBoardReturn, modelValue: DrawingData): DrawingData {
  return {
    ...createDrawingDataSnapshot(board.state.value),
    viewport: modelValue.viewport
  };
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
      if (!modelValue || isModelContentEqualToBoard(modelValue, options.board)) {
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
    () => options.board.state.value.elements,
    (): void => {
      if (options.modelValue.value === undefined || syncingModelValueToBoard) {
        return;
      }

      if (isModelContentEqualToBoard(options.modelValue.value, options.board)) {
        return;
      }

      options.emitUpdate(createModelUpdateSnapshot(options.board, options.modelValue.value));
    },
    { deep: true }
  );
}
