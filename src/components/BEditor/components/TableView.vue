<template>
  <NodeViewWrapper :class="name">
    <div ref="viewportRef" :class="[bem('viewport'), { 'is-cell-dragging': isDraggingCellSelection }]" @mouseleave="handleViewportMouseLeave">
      <div
        ref="scrollerRef"
        :class="bem('scroller')"
        @mousedown="handleScrollerMouseDown"
        @mousemove="handleMouseMove"
        @mouseleave="handleScrollerMouseLeave"
        @scroll="handleScroll"
      >
        <NodeViewContent as="table" :class="bem('table')" />
      </div>

      <!-- 分割线 + 新增按钮 -->
      <div v-show="showDividerOverlay" :class="bem('line-overlay')" contenteditable="false">
        <div v-show="showAddColumnButton" :class="bem('line-highlight', 'column')" :style="columnLineHighlightStyle"></div>
        <div v-show="showAddRowButton" :class="bem('line-highlight', 'row')" :style="rowLineHighlightStyle"></div>
        <div v-show="showAddColumnButton" :class="[bem('add-button-group'), bem('add-button-group', 'column')]" :style="addColumnButtonStyle">
          <button
            ref="addColumnButtonRef"
            type="button"
            :class="bem('add-button')"
            title="新增列"
            aria-label="新增列"
            @mousedown.prevent
            @mouseenter="handleOverlayControlMouseEnter"
            @click="handleAdd(addHover?.column ?? null)"
          >
            <BIcon :class="bem('button-icon')" :icon="ICONS.add" />
          </button>
        </div>
        <div v-show="showAddRowButton" :class="[bem('add-button-group'), bem('add-button-group', 'row')]" :style="addRowButtonStyle">
          <button
            ref="addRowButtonRef"
            type="button"
            :class="bem('add-button')"
            title="新增行"
            aria-label="新增行"
            @mousedown.prevent
            @mouseenter="handleOverlayControlMouseEnter"
            @click="handleAdd(addHover?.row ?? null)"
          >
            <BIcon :class="bem('button-icon')" :icon="ICONS.add" />
          </button>
        </div>
      </div>

      <!-- 区段 + 删除按钮 -->
      <div v-show="showSegmentOverlay" :class="bem('segment-overlay')" contenteditable="false">
        <div v-show="showRemoveRowButton" :class="bem('segment-button-group', 'row')" :style="removeRowButtonStyle">
          <button
            ref="removeRowButtonRef"
            type="button"
            :class="bem('remove-button', 'row')"
            title="删除行"
            aria-label="删除行"
            @mousedown.prevent
            @mouseenter="handleOverlayControlMouseEnter"
            @click="handleRemove(segmentHover?.row ?? null)"
          >
            <BIcon :class="bem('button-icon')" :icon="ICONS.remove" />
          </button>
        </div>
        <div v-show="showRemoveColumnButton" :class="bem('segment-button-group', 'column')" :style="removeColumnButtonStyle">
          <button
            ref="removeColumnButtonRef"
            type="button"
            :class="bem('remove-button', 'column')"
            title="删除列"
            aria-label="删除列"
            @mousedown.prevent
            @mouseenter="handleOverlayControlMouseEnter"
            @click="handleRemove(segmentHover?.column ?? null)"
          >
            <BIcon :class="bem('button-icon')" :icon="ICONS.remove" />
          </button>
        </div>
      </div>
    </div>
  </NodeViewWrapper>
</template>

<script setup lang="ts">
/**
 * @file TableView.vue
 * @description TipTap 表格 NodeView，负责富文本表格的 hover 增删控件。
 */

import type { CSSProperties } from 'vue';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { CellSelection, TableMap } from '@tiptap/pm/tables';
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3';
import { createNamespace } from '@/utils/namespace';
import { applyAddAction, applyRemoveAction } from '../extensions/tableControlsCommands';
import {
  findHoveredDividers,
  findHoveredSegments,
  getAddButtonPosition,
  getRemoveButtonPosition,
  type DividerHit,
  type DividerHover,
  type DOMRectLike,
  type SegmentHover,
  type SegmentHit
} from '../extensions/tableControlsGeometry';

const [name, bem] = createNamespace('', 'b-markdown-table');

// ─── 常量 ────────────────────────────────────────────────────────────────────

const props = defineProps(nodeViewProps);

const UI = {
  DIVIDER_THRESHOLD: 6,
  LINE_THICKNESS: 2,
  OVERLAY_GUTTER: 0,
  SEGMENT_HIDE_DELAY: 90,
  DRAG_SELECTION_THRESHOLD: 4,
  // 外侧按钮悬挂在表格边界外，需要更长缓冲时间让鼠标穿过间隙。
  OVERLAY_HIDE_DELAY: 220
} as const;

const ICONS = {
  add: 'mdi:plus',
  remove: 'mdi:minus'
} as const;

const FALLBACK = {
  COLUMN_WIDTH: 120,
  ROW_HEIGHT: 40,
  ROW_COUNT: 3,
  COLUMN_COUNT: 3
} as const;

// ─── Refs ────────────────────────────────────────────────────────────────────

const viewportRef = ref<HTMLElement | null>(null);
const scrollerRef = ref<HTMLElement | null>(null);
const addColumnButtonRef = ref<HTMLButtonElement | null>(null);
const addRowButtonRef = ref<HTMLButtonElement | null>(null);
const removeRowButtonRef = ref<HTMLButtonElement | null>(null);
const removeColumnButtonRef = ref<HTMLButtonElement | null>(null);

/**
 * 表格单元格的逻辑坐标。
 */
interface TableCellPosition {
  /** 行索引。 */
  row: number;
  /** 列索引。 */
  column: number;
}

/**
 * 当前拖拽选区状态。
 */
interface DragSelectionState {
  /** 拖拽起始单元格。 */
  anchor: TableCellPosition;
  /** 拖拽当前经过的单元格。 */
  head: TableCellPosition;
}

/**
 * 尚未跨过拖拽阈值时的候选拖拽状态。
 */
interface PendingDragState {
  /** 按下时命中的起始单元格。 */
  anchor: TableCellPosition;
  /** 鼠标按下时的起始坐标。 */
  startPointer: {
    clientX: number;
    clientY: number;
  };
}

// ─── hover 状态 ─────────────────────────────────────────────────────────────

/**
 * 当前命中的分割线；存在时显示新增控件。
 */
const addHover = ref<DividerHover | null>(null);
/**
 * 当前命中的区段；存在时显示删除控件。
 */
const segmentHover = ref<SegmentHover | null>(null);
/**
 * 当前实际显示的 overlay 类型。
 */
const activeOverlay = ref<'none' | 'divider' | 'segment'>('none');
const lastPointer = ref<{ clientX: number; clientY: number } | null>(null);
const dragSelection = ref<DragSelectionState | null>(null);
const pendingDrag = ref<PendingDragState | null>(null);

let segmentHideTimer = 0;
let overlayHideTimer = 0;
let scrollFrame = 0;

/**
 * 清理区段 overlay 的延时关闭定时器。
 */
function clearSegmentHideTimer(): void {
  if (segmentHideTimer !== 0) {
    window.clearTimeout(segmentHideTimer);
    segmentHideTimer = 0;
  }
}

/**
 * 清理整个 hover overlay 的延时关闭定时器。
 */
function clearOverlayHideTimer(): void {
  if (overlayHideTimer !== 0) {
    window.clearTimeout(overlayHideTimer);
    overlayHideTimer = 0;
  }
}

/**
 * 清空全部 hover 命中状态。
 */
function clearHoverState(): void {
  clearOverlayHideTimer();
  clearSegmentHideTimer();
  activeOverlay.value = 'none';
}

/**
 * 延迟关闭区段 overlay，让快速移动到分割线时不至于闪烁。
 */
function scheduleSegmentHide(): void {
  if (segmentHideTimer !== 0) return;
  segmentHideTimer = window.setTimeout(() => {
    segmentHideTimer = 0;
    activeOverlay.value = addHover.value?.row || addHover.value?.column ? 'divider' : 'none';
  }, UI.SEGMENT_HIDE_DELAY);
}

/**
 * 延迟关闭全部 overlay，给鼠标移向外层按钮留出缓冲时间。
 */
function scheduleOverlayHide(): void {
  if (overlayHideTimer !== 0) return;
  overlayHideTimer = window.setTimeout(() => {
    overlayHideTimer = 0;
    clearHoverState();
  }, UI.OVERLAY_HIDE_DELAY);
}

// ─── 几何计算 ────────────────────────────────────────────────────────────────

/**
 * 将视口矩形转换为相对 scroller 内容区域的局部坐标。
 */
function toLocalRect(rect: DOMRect, scrollerRect: DOMRect, scroller: HTMLElement): DOMRectLike {
  return {
    top: rect.top - scrollerRect.top + scroller.scrollTop,
    right: rect.right - scrollerRect.left + scroller.scrollLeft,
    bottom: rect.bottom - scrollerRect.top + scroller.scrollTop,
    left: rect.left - scrollerRect.left + scroller.scrollLeft,
    width: rect.width,
    height: rect.height
  };
}

/**
 * 将 DOMRect 标准化为纯数据矩形，便于命中区复用。
 */
function toRectLike(rect: DOMRect): DOMRectLike {
  return {
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
    width: rect.width,
    height: rect.height
  };
}

/**
 * 判断当前指针是否处于给定矩形范围内。
 */
function isPointInsideRect(rect: DOMRectLike, clientX: number, clientY: number): boolean {
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

/**
 * 为命中矩形增加缓冲边距，提升外侧悬挂按钮的容错范围。
 */
function expandRect(rect: DOMRectLike, padding: number): DOMRectLike {
  return {
    top: rect.top - padding,
    right: rect.right + padding,
    bottom: rect.bottom + padding,
    left: rect.left - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2
  };
}

/**
 * 合并两个矩形，生成覆盖二者的连续交互区。
 */
function mergeRects(first: DOMRectLike, second: DOMRectLike): DOMRectLike {
  const left = Math.min(first.left, second.left);
  const right = Math.max(first.right, second.right);
  const top = Math.min(first.top, second.top);
  const bottom = Math.max(first.bottom, second.bottom);
  return { top, right, bottom, left, width: right - left, height: bottom - top };
}

/**
 * 测试/空内容场景下的回退几何。
 */
function createFallbackGeometry(): { columnRects: DOMRectLike[]; rowRects: DOMRectLike[] } {
  const { COLUMN_WIDTH, ROW_HEIGHT, ROW_COUNT, COLUMN_COUNT } = FALLBACK;

  const columnRects = Array.from({ length: COLUMN_COUNT }, (_, i) => ({
    top: 0,
    bottom: ROW_HEIGHT * ROW_COUNT,
    left: i * COLUMN_WIDTH,
    right: (i + 1) * COLUMN_WIDTH,
    width: COLUMN_WIDTH,
    height: ROW_HEIGHT * ROW_COUNT
  }));

  const rowRects = Array.from({ length: ROW_COUNT }, (_, i) => ({
    top: i * ROW_HEIGHT,
    bottom: (i + 1) * ROW_HEIGHT,
    left: 0,
    right: COLUMN_WIDTH * COLUMN_COUNT,
    width: COLUMN_WIDTH * COLUMN_COUNT,
    height: ROW_HEIGHT
  }));

  return { columnRects, rowRects };
}

/**
 * 读取首行各列的局部矩形，列高度拉伸到整个表格范围。
 */
function readColumnRects(rows: Element[], scroller: HTMLElement, scrollerRect: DOMRect): DOMRectLike[] {
  const firstRow = rows[0];
  if (!firstRow) return [];

  const toLocal = (el: Element) => toLocalRect(el.getBoundingClientRect(), scrollerRect, scroller);
  const rowRects = rows.map(toLocal);
  const tableTop = rowRects[0]?.top ?? 0;
  const tableBottom = rowRects[rowRects.length - 1]?.bottom ?? 0;

  return Array.from(firstRow.querySelectorAll('th,td')).map((cell) => {
    const cellRect = toLocal(cell);
    // 列高度拉伸到整个表格范围
    return { ...cellRect, top: tableTop, bottom: tableBottom, height: tableBottom - tableTop };
  });
}

/**
 * 读取当前表格的行列几何，DOM 读取失败时降级为 fallback。
 */
function readTableGeometry(): { columnRects: DOMRectLike[]; rowRects: DOMRectLike[] } {
  const scroller = scrollerRef.value;
  const tableElement = scroller?.querySelector('table');

  if (!scroller || !(tableElement instanceof HTMLTableElement)) {
    return createFallbackGeometry();
  }

  const scrollerRect = scroller.getBoundingClientRect();
  const toLocal = (el: Element) => toLocalRect(el.getBoundingClientRect(), scrollerRect, scroller);
  const rows = Array.from(tableElement.querySelectorAll('tr'));
  const rowRects = rows.map(toLocal);
  const columnRects = readColumnRects(rows, scroller, scrollerRect);

  if (rowRects.length === 0 || columnRects.length === 0) {
    return createFallbackGeometry();
  }

  return { columnRects, rowRects };
}

/**
 * 读取当前表格下的所有可命中单元格。
 * @returns 单元格节点列表
 */
function getTableCells(): HTMLTableCellElement[] {
  const tableElement = scrollerRef.value?.querySelector('table');
  if (!(tableElement instanceof HTMLTableElement)) {
    return [];
  }

  return Array.from(tableElement.querySelectorAll('th,td')).filter((cell): cell is HTMLTableCellElement => cell instanceof HTMLTableCellElement);
}

/**
 * 根据指针坐标命中当前表格中的单元格。
 * @param clientX - 视口横坐标
 * @param clientY - 视口纵坐标
 * @returns 命中的单元格；未命中时返回 null
 */
function findCellElementByPoint(clientX: number, clientY: number): HTMLTableCellElement | null {
  return (
    getTableCells().find((cell) => {
      const rect = cell.getBoundingClientRect();
      return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    }) ?? null
  );
}

/**
 * 计算单元格在当前行中的逻辑列索引。
 * 简单表格下直接累加前序单元格的 `colSpan`，兼容基础跨列场景。
 * @param cell - 当前单元格
 * @returns 逻辑列索引；无法定位时返回 null
 */
function getCellColumnIndex(cell: HTMLTableCellElement): number | null {
  const row = cell.parentElement;
  if (!(row instanceof HTMLTableRowElement)) {
    return null;
  }

  let columnIndex = 0;
  for (const currentCell of Array.from(row.cells)) {
    if (currentCell === cell) {
      return columnIndex;
    }
    columnIndex += currentCell.colSpan || 1;
  }

  return null;
}

/**
 * 读取单元格在表格中的逻辑坐标。
 * @param cell - 当前单元格
 * @returns 行列坐标；无法定位时返回 null
 */
function getCellPosition(cell: HTMLTableCellElement): TableCellPosition | null {
  const row = cell.parentElement;
  if (!(row instanceof HTMLTableRowElement) || row.sectionRowIndex < 0) {
    return null;
  }

  const column = getCellColumnIndex(cell);
  if (column === null) {
    return null;
  }

  return {
    row: row.sectionRowIndex,
    column
  };
}

/**
 * 从当前事件或指针坐标中解析命中的单元格位置。
 * @param target - 事件目标
 * @param clientX - 视口横坐标
 * @param clientY - 视口纵坐标
 * @returns 命中的单元格位置；未命中时返回 null
 */
function resolveCellPosition(target: EventTarget | null, clientX: number, clientY: number): TableCellPosition | null {
  const targetCell = target instanceof Element ? target.closest('th,td') : null;
  if (targetCell instanceof HTMLTableCellElement && scrollerRef.value?.contains(targetCell)) {
    return getCellPosition(targetCell);
  }

  const pointedCell = findCellElementByPoint(clientX, clientY);
  return pointedCell ? getCellPosition(pointedCell) : null;
}

// ─── 滚动区域矩形工具 ────────────────────────────────────────────────────────

/**
 * 读取当前表格可视滚动区域的 client 坐标矩形。
 */
function getScrollerClientRect(): DOMRectLike | null {
  const rect = scrollerRef.value?.getBoundingClientRect();
  return rect ? toRectLike(rect) : null;
}

/**
 * 构造边缘过渡带：沿滚动区域某条边缘的零高度/宽度矩形。
 * column 按钮悬挂在顶边，row 按钮悬挂在左边。
 */
function getEdgeTransitionRect(type: 'row' | 'column'): DOMRectLike | null {
  const r = getScrollerClientRect();
  if (!r) return null;

  if (type === 'column') {
    // 顶边：零高度横带
    return { top: r.top, right: r.right, bottom: r.top, left: r.left, width: r.width, height: 0 };
  }
  // 左边：零宽度竖带
  return { top: r.top, right: r.left, bottom: r.bottom, left: r.left, width: 0, height: r.height };
}

// ─── 新增按钮可见性 ──────────────────────────────────────────────────────────

/**
 * 判断新增按钮（行/列）是否应保持可见。
 * 指针在 scroller 内部，或仍在沿边缘通道内时，返回 true。
 * - type === 'row'：对应原 shouldShowRowAddButton，通道为左侧竖带
 * - type === 'column'：对应原 shouldShowColumnAddButton，通道为顶部横带
 */
function shouldShowAddButton(type: 'row' | 'column'): boolean {
  const hit = type === 'row' ? addHover.value?.row : addHover.value?.column;
  if (!hit) return false;

  const pointer = lastPointer.value;
  const scrollerRect = getScrollerClientRect();
  if (!pointer || !scrollerRect || scrollerRect.width === 0 || scrollerRect.height === 0) return true;

  const p = UI.DIVIDER_THRESHOLD;
  const insideScroller = isPointInsideRect(scrollerRect, pointer.clientX, pointer.clientY);
  if (insideScroller) return true;

  if (type === 'row') {
    return pointer.clientX <= scrollerRect.left + p && pointer.clientY >= scrollerRect.top - p && pointer.clientY <= scrollerRect.bottom + p;
  }
  return pointer.clientY <= scrollerRect.top + p && pointer.clientX >= scrollerRect.left - p && pointer.clientX <= scrollerRect.right + p;
}

// ─── 过渡区命中检测 ──────────────────────────────────────────────────────────

type TransitionTarget = { button: HTMLButtonElement | null; sourceRect: DOMRectLike | null };

/**
 * 按当前 activeOverlay 返回需要检测的按钮与来源矩形对列表。
 */
function getTransitionTargets(): TransitionTarget[] {
  if (activeOverlay.value === 'divider') {
    return [
      { button: addColumnButtonRef.value, sourceRect: addHover.value?.column ? getEdgeTransitionRect('column') : null },
      { button: addRowButtonRef.value, sourceRect: addHover.value?.row ? getEdgeTransitionRect('row') : null }
    ];
  }
  if (activeOverlay.value === 'segment') {
    return [
      { button: removeRowButtonRef.value, sourceRect: segmentHover.value?.row ? getEdgeTransitionRect('row') : null },
      { button: removeColumnButtonRef.value, sourceRect: segmentHover.value?.column ? getEdgeTransitionRect('column') : null }
    ];
  }
  return [];
}

function isPointerWithinOverlayTransitionZone(clientX: number, clientY: number): boolean {
  const padding = 8;
  return getTransitionTargets().some(({ button, sourceRect }) => {
    if (!button || !sourceRect) return false;
    const buttonRect = toRectLike(button.getBoundingClientRect());
    return isPointInsideRect(expandRect(mergeRects(sourceRect, buttonRect), padding), clientX, clientY);
  });
}

// ─── 指针 & 滚动处理 ─────────────────────────────────────────────────────────

/**
 * 将视口坐标转为 scroller 局部坐标。
 */
function toLocalPointer(clientX: number, clientY: number, scroller: HTMLElement): { x: number; y: number } {
  const rect = scroller.getBoundingClientRect();
  return { x: clientX - rect.left + scroller.scrollLeft, y: clientY - rect.top + scroller.scrollTop };
}

/**
 * 根据当前指针坐标更新 hoverState。
 */
function updateHoverState(clientX: number, clientY: number): void {
  clearOverlayHideTimer();
  if (!props.editor.isEditable || dragSelection.value) {
    clearHoverState();
    return;
  }

  const scroller = scrollerRef.value;
  if (!scroller) {
    clearHoverState();
    return;
  }

  const { x, y } = toLocalPointer(clientX, clientY, scroller);
  const geometry = readTableGeometry();
  const params = { clientX: x, clientY: y, threshold: UI.DIVIDER_THRESHOLD, ...geometry };

  const divider = findHoveredDividers(params);
  if (divider) {
    addHover.value = divider;
    if (activeOverlay.value === 'segment' && segmentHover.value) {
      scheduleSegmentHide();
      return;
    }
    clearSegmentHideTimer();
    activeOverlay.value = 'divider';
    segmentHover.value = null;
    return;
  }

  const segment = findHoveredSegments(params);
  if (segment) {
    clearSegmentHideTimer();
    addHover.value = null;
    segmentHover.value = segment;
    activeOverlay.value = 'segment';
    return;
  }

  // 鼠标离开命中线后，给移向外侧悬挂按钮留出短暂缓冲，避免控件立即消失。
  scheduleOverlayHide();
}

/**
 * 判断两个单元格坐标是否相同。
 * @param first - 第一个坐标
 * @param second - 第二个坐标
 * @returns 完全相同时返回 true
 */
function isSameCellPosition(first: TableCellPosition, second: TableCellPosition): boolean {
  return first.row === second.row && first.column === second.column;
}

/**
 * 判断当前位置是否已经跨过拖拽阈值。
 * @param startPointer - 鼠标按下时的起始坐标
 * @param clientX - 当前横坐标
 * @param clientY - 当前纵坐标
 * @returns 超过阈值时返回 true
 */
function hasExceededDragThreshold(startPointer: { clientX: number; clientY: number }, clientX: number, clientY: number): boolean {
  return Math.abs(clientX - startPointer.clientX) >= UI.DRAG_SELECTION_THRESHOLD || Math.abs(clientY - startPointer.clientY) >= UI.DRAG_SELECTION_THRESHOLD;
}

/**
 * 判断 relatedTarget 是否仍在当前表格控件的可交互区域内。
 */
function isInsideViewport(target: EventTarget | null): boolean {
  return target instanceof Node && viewportRef.value?.contains(target) === true;
}

/**
 * 鼠标离开 scroller 但仍在当前表格控件内部时，不应立即隐藏控件。
 */
function handleScrollerMouseLeave(event: MouseEvent): void {
  if (isInsideViewport(event.relatedTarget)) return;
  scheduleOverlayHide();
}

/**
 * 只有真正离开整个表格控件时才清空 hover。
 */
function handleViewportMouseLeave(event: MouseEvent): void {
  if (isInsideViewport(event.relatedTarget)) return;
  scheduleOverlayHide();
}

/**
 * 鼠标真正进入外侧悬挂按钮时，取消隐藏计时，避免按钮在点击前消失。
 */
function handleOverlayControlMouseEnter(): void {
  clearOverlayHideTimer();
  clearSegmentHideTimer();
}

/**
 * 判断指针是否仍在 viewport 可见边界内。
 */
function isPointerInsideViewportBounds(clientX: number, clientY: number): boolean {
  const rect = viewportRef.value?.getBoundingClientRect();
  if (!rect) return false;
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

/**
 * 在鼠标离开表格几何区域后，继续追踪通往外侧按钮的移动轨迹。
 */
// ─── 编辑器操作 ──────────────────────────────────────────────────────────────

/**
 * 读取当前 NodeView 对应表格在文档中的起始位置。
 * @returns 表格起始位置，无法定位时返回 null
 */
function getCurrentTablePos(): number | null {
  if (typeof props.getPos !== 'function') {
    return null;
  }

  const position = props.getPos();
  return typeof position === 'number' ? position : null;
}

/**
 * 读取当前 NodeView 对应表格的映射信息。
 * @returns 当前表格的 TableMap 与起始位置
 */
function getCurrentTableMap(): { map: TableMap; tablePos: number } | null {
  const tablePos = getCurrentTablePos();
  if (tablePos === null || props.node.type.name !== 'table') {
    return null;
  }

  return {
    map: TableMap.get(props.node),
    tablePos
  };
}

/**
 * 聚焦到当前表格中的目标单元格。
 */
function focusCellAt(position: { row: number; column: number }): boolean {
  const { tr, doc } = props.editor.state;
  const tableState = getCurrentTableMap();
  if (!tableState) return false;

  const row = Math.min(position.row, tableState.map.height - 1);
  const column = Math.min(position.column, tableState.map.width - 1);
  const cellPos = tableState.tablePos + 1 + tableState.map.map[row * tableState.map.width + column];

  props.editor.view.dispatch(tr.setSelection(CellSelection.create(doc, cellPos)));
  return true;
}

/**
 * 读取指定单元格的文档位置。
 * @param position - 单元格逻辑坐标
 * @returns 单元格位置；无法定位时返回 null
 */
function getCellDocumentPosition(position: TableCellPosition): number | null {
  const tableState = getCurrentTableMap();
  if (!tableState) {
    return null;
  }

  const row = Math.min(position.row, tableState.map.height - 1);
  const column = Math.min(position.column, tableState.map.width - 1);
  return tableState.tablePos + 1 + tableState.map.map[row * tableState.map.width + column];
}

/**
 * 将当前拖拽范围同步为矩形单元格选区。
 * @param anchor - 起始单元格
 * @param head - 当前单元格
 * @returns 是否成功更新选区
 */
function setDraggedCellSelection(anchor: TableCellPosition, head: TableCellPosition): boolean {
  const anchorPos = getCellDocumentPosition(anchor);
  const headPos = getCellDocumentPosition(head);
  if (anchorPos === null || headPos === null) {
    return false;
  }

  const { doc, tr } = props.editor.state;
  props.editor.view.dispatch(tr.setSelection(CellSelection.create(doc, anchorPos, headPos)).scrollIntoView());
  return true;
}

/**
 * 开始表格拖拽选区。
 * @param event - 鼠标按下事件
 */
function handleScrollerMouseDown(event: MouseEvent): void {
  if (!props.editor.isEditable || event.button !== 0) {
    return;
  }

  const position = resolveCellPosition(event.target, event.clientX, event.clientY);
  if (!position) {
    return;
  }

  lastPointer.value = { clientX: event.clientX, clientY: event.clientY };
  pendingDrag.value = {
    anchor: position,
    startPointer: {
      clientX: event.clientX,
      clientY: event.clientY
    }
  };
}

/**
 * 按当前鼠标位置扩展拖拽选区。
 * @param target - 当前事件目标
 * @param clientX - 视口横坐标
 * @param clientY - 视口纵坐标
 */
function updateDragSelection(target: EventTarget | null, clientX: number, clientY: number): void {
  const currentDrag = dragSelection.value;
  if (!currentDrag) {
    return;
  }

  const position = resolveCellPosition(target, clientX, clientY);
  if (!position || isSameCellPosition(position, currentDrag.head)) {
    return;
  }

  dragSelection.value = {
    anchor: currentDrag.anchor,
    head: position
  };
  setDraggedCellSelection(currentDrag.anchor, position);
}

/**
 * 结束当前拖拽选区。
 */
function stopDragSelection(): void {
  dragSelection.value = null;
  pendingDrag.value = null;
}

/**
 * 清理浏览器原生文字选区，避免表格矩形拖拽时同时出现文本选中。
 */
function clearDomTextSelection(): void {
  window.getSelection()?.removeAllRanges();
}

/**
 * 处理表格内部鼠标移动。
 * 拖拽时优先扩展单元格选区，否则继续走 hover 控件逻辑。
 * @param event - 当前鼠标移动事件
 */
function handleMouseMove(event: MouseEvent): void {
  lastPointer.value = { clientX: event.clientX, clientY: event.clientY };
  if (dragSelection.value) {
    updateDragSelection(event.target, event.clientX, event.clientY);
    return;
  }

  const currentPendingDrag = pendingDrag.value;
  if (currentPendingDrag) {
    if ((event.buttons & 1) === 0) {
      pendingDrag.value = null;
    } else {
      const currentCellPosition = resolveCellPosition(event.target, event.clientX, event.clientY);
      const hasExceededThreshold = hasExceededDragThreshold(currentPendingDrag.startPointer, event.clientX, event.clientY);
      const hasCrossedIntoAnotherCell = currentCellPosition !== null && !isSameCellPosition(currentCellPosition, currentPendingDrag.anchor);

      if (hasExceededThreshold && hasCrossedIntoAnotherCell) {
        clearHoverState();
        clearDomTextSelection();
        dragSelection.value = {
          anchor: currentPendingDrag.anchor,
          head: currentPendingDrag.anchor
        };
        pendingDrag.value = null;
        updateDragSelection(event.target, event.clientX, event.clientY);
        return;
      }

      return;
    }
  }

  updateHoverState(event.clientX, event.clientY);
}

/**
 * 在鼠标离开表格几何区域后，继续追踪通往外侧按钮的移动轨迹。
 * 拖拽期间改为继续扩展单元格选区。
 * @param event - 当前全局鼠标移动事件
 */
function handleWindowMouseMove(event: MouseEvent): void {
  lastPointer.value = { clientX: event.clientX, clientY: event.clientY };
  if (dragSelection.value) {
    updateDragSelection(event.target, event.clientX, event.clientY);
    return;
  }
  if (activeOverlay.value === 'none') return;

  if (isPointerInsideViewportBounds(event.clientX, event.clientY) || isPointerWithinOverlayTransitionZone(event.clientX, event.clientY)) {
    clearOverlayHideTimer();
    return;
  }

  scheduleOverlayHide();
}

/**
 * 滚动时用 rAF 节流，重新计算 hover 命中。
 */
function handleScroll(): void {
  cancelAnimationFrame(scrollFrame);
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0;
    if (lastPointer.value) {
      updateHoverState(lastPointer.value.clientX, lastPointer.value.clientY);
    }
  });
}

/**
 * 读取当前 NodeView 对应表格的行列数。
 */
function getDimensions(): { rowCount: number; columnCount: number } {
  const tableState = getCurrentTableMap();
  if (!tableState) return { rowCount: FALLBACK.ROW_COUNT, columnCount: FALLBACK.COLUMN_COUNT };

  return { rowCount: tableState.map.height, columnCount: tableState.map.width };
}

const editorContext = { editor: props.editor, focusCellAt, getDimensions };

/**
 * 执行新增动作；行列按钮各自传入自己的命中目标。
 */
function handleAdd(hit: DividerHit | null): void {
  if (hit) applyAddAction(editorContext, hit);
  clearHoverState();
}

/**
 * 执行删除动作；行列按钮各自传入自己的命中目标。
 */
function handleRemove(hit: SegmentHit | null): void {
  if (hit) applyRemoveAction(editorContext, hit);
  clearHoverState();
}

// ─── 样式计算 ────────────────────────────────────────────────────────────────

/**
 * 将内容坐标投影到可见视口坐标，供外层 overlay 使用。
 */
function toViewportPosition(position: { top: number; left: number }): { top: number; left: number } {
  const scroller = scrollerRef.value;
  if (!scroller) return position;
  return {
    top: position.top - scroller.scrollTop + UI.OVERLAY_GUTTER,
    left: position.left - scroller.scrollLeft + UI.OVERLAY_GUTTER
  };
}

function toViewportStyle(position: { top: number; left: number }): CSSProperties {
  const vp = toViewportPosition(position);
  return { top: `${vp.top}px`, left: `${vp.left}px` };
}

function getLineHighlightStyle(hit: DividerHit | null): CSSProperties {
  if (!hit) return {};
  const { lineRect } = hit;
  const t = UI.LINE_THICKNESS;
  const vp = toViewportPosition({ top: lineRect.top, left: lineRect.left });

  if (hit.type === 'column') {
    return { left: `${vp.left - t / 2}px`, top: `${vp.top}px`, width: `${t}px`, height: `${lineRect.height}px` };
  }
  return { left: `${vp.left}px`, top: `${vp.top - t / 2}px`, width: `${lineRect.width}px`, height: `${t}px` };
}

const columnLineHighlightStyle = computed<CSSProperties>(() => getLineHighlightStyle(addHover.value?.column ?? null));
const rowLineHighlightStyle = computed<CSSProperties>(() => getLineHighlightStyle(addHover.value?.row ?? null));

const addColumnButtonStyle = computed<CSSProperties | null>(() => {
  const hit = addHover.value?.column ?? null;
  return hit ? toViewportStyle(getAddButtonPosition(hit)) : null;
});

const addRowButtonStyle = computed<CSSProperties | null>(() => {
  const hit = addHover.value?.row ?? null;
  return hit ? toViewportStyle(getAddButtonPosition(hit)) : null;
});

const removeRowButtonStyle = computed<CSSProperties | null>(() => {
  const hit = segmentHover.value?.row ?? null;
  return hit ? toViewportStyle(getRemoveButtonPosition(hit)) : null;
});

const removeColumnButtonStyle = computed<CSSProperties | null>(() => {
  const hit = segmentHover.value?.column ?? null;
  return hit ? toViewportStyle(getRemoveButtonPosition(hit)) : null;
});

/**
 * 当前是否显示分割线 overlay。
 */
const showDividerOverlay = computed<boolean>(() => {
  return !dragSelection.value && activeOverlay.value === 'divider' && Boolean(addHover.value?.row || addHover.value?.column);
});

/**
 * 当前是否显示区段 overlay。
 */
const showSegmentOverlay = computed<boolean>(() => !dragSelection.value && activeOverlay.value === 'segment' && segmentHover.value !== null);

/**
 * 当前是否显示新增行按钮。
 */
const showAddRowButton = computed<boolean>(() => !dragSelection.value && addRowButtonStyle.value !== null && shouldShowAddButton('row'));

/**
 * 当前是否显示新增列按钮。
 */
const showAddColumnButton = computed<boolean>(() => !dragSelection.value && addColumnButtonStyle.value !== null && shouldShowAddButton('column'));

/**
 * 当前是否显示删除行按钮。
 */
const showRemoveRowButton = computed<boolean>(() => !dragSelection.value && removeRowButtonStyle.value !== null);

/**
 * 当前是否显示删除列按钮。
 */
const showRemoveColumnButton = computed<boolean>(() => !dragSelection.value && removeColumnButtonStyle.value !== null);

/**
 * 当前是否处于表格矩形拖拽选区中。
 */
const isDraggingCellSelection = computed<boolean>(() => dragSelection.value !== null);

// ─── 生命周期 ────────────────────────────────────────────────────────────────

onMounted(() => {
  window.addEventListener('mousemove', handleWindowMouseMove);
  window.addEventListener('mouseup', stopDragSelection);
});

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', handleWindowMouseMove);
  window.removeEventListener('mouseup', stopDragSelection);
  cancelAnimationFrame(scrollFrame);
  clearOverlayHideTimer();
  clearSegmentHideTimer();
});
</script>

<style lang="less">
.b-markdown-table {
  width: 100%;
  margin: 0.75em 0;
  overflow: visible;
}

.b-markdown-table__viewport {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  overflow: visible;

  &.is-cell-dragging,
  &.is-cell-dragging * {
    -webkit-user-select: none;
    user-select: none;
  }
}

.b-markdown-table__scroller {
  width: 100%;
  overflow-x: auto;
}

.b-markdown-table__table {
  width: 100%;
  margin: 0;
  border-spacing: 0;
  border-collapse: separate;
  border: 1px solid var(--editor-table-border);
  border-radius: 8px;
}

.b-markdown-table__line-overlay,
.b-markdown-table__segment-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.b-markdown-table__line-highlight {
  position: absolute;
  z-index: 1;
  pointer-events: none;
  background-color: color-mix(in srgb, var(--editor-link) 78%, transparent);
  border-radius: 999px;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--editor-link) 22%, transparent);
}

.b-markdown-table__add-button,
.b-markdown-table__remove-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  color: #fff;
  cursor: pointer;
  background-color: var(--color-primary);
  border-radius: 999px;
}

.b-markdown-table__add-button {
  pointer-events: auto;
}

.b-markdown-table__add-button-group,
.b-markdown-table__segment-button-group {
  position: absolute;
  z-index: 3;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
}

.b-markdown-table__add-button-group--column,
.b-markdown-table__segment-button-group--column {
  transform: translate(-50%, -100%);
}

.b-markdown-table__add-button-group--row,
.b-markdown-table__segment-button-group--row {
  transform: translate(-100%, -50%);
}

.b-markdown-table__add-button:active {
  transform: scale(0.96);
}

.b-markdown-table__remove-button {
  pointer-events: auto;

  &:active {
    transform: scale(0.96);
  }
}

.b-markdown-table__button-icon {
  width: 15px;
  height: 15px;
  pointer-events: none;
}
</style>
