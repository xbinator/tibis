<!--
  @file MultiSelectSetter.vue
  @description 画图页面多选元素概览和快捷操作面板。
-->
<template>
  <section class="multi-select-setter">
    <header class="multi-select-setter-header">
      <div>
        <div class="multi-select-setter-title">已选择 {{ selectedElements.length }} 个元素</div>
        <div class="multi-select-setter-subtitle">{{ groupStatusText }}</div>
      </div>
      <div class="multi-select-setter-count">{{ selectedElements.length }}</div>
    </header>

    <BSectionBlock title="类型">
      <BSectionItem v-for="item in typeSummaries" :key="item.key" :icon="item.icon">
        <span class="multi-select-setter-value">{{ item.label }} {{ item.count }}</span>
      </BSectionItem>
    </BSectionBlock>

    <BSectionBlock title="范围">
      <div class="multi-select-setter-stat-grid">
        <BSectionItem class="multi-select-setter-stat-item" direction="vertical" label="X / Y">
          <strong class="multi-select-setter-stat-value">{{ boundsText.position }}</strong>
        </BSectionItem>
        <BSectionItem class="multi-select-setter-stat-item" direction="vertical" label="外接框">
          <strong class="multi-select-setter-stat-value">{{ boundsText.size }}</strong>
        </BSectionItem>
        <BSectionItem class="multi-select-setter-stat-item" direction="vertical" label="图层">
          <strong class="multi-select-setter-stat-value">{{ layerRangeText }}</strong>
        </BSectionItem>
        <BSectionItem class="multi-select-setter-stat-item" direction="vertical" label="组合">
          <strong class="multi-select-setter-stat-value">{{ groupStatusText }}</strong>
        </BSectionItem>
      </div>
    </BSectionBlock>

    <BSectionBlock title="快捷操作">
      <div class="multi-select-setter-actions">
        <button class="multi-select-setter-action" data-testid="multi-select-command-group" type="button" @click="emitCommand('group')">
          <BIcon icon="lucide:group" :size="15" />
          <span>合并</span>
        </button>
        <button class="multi-select-setter-action" data-testid="multi-select-command-ungroup" type="button" @click="emitCommand('ungroup')">
          <BIcon icon="lucide:ungroup" :size="15" />
          <span>取消合并</span>
        </button>
        <button class="multi-select-setter-action" data-testid="multi-select-command-copy" type="button" @click="emitCommand('copy')">
          <BIcon icon="lucide:copy" :size="15" />
          <span>复制</span>
        </button>
        <button class="multi-select-setter-action is-danger" data-testid="multi-select-command-delete" type="button" @click="emitCommand('delete')">
          <BIcon icon="lucide:trash-2" :size="15" />
          <span>删除</span>
        </button>
        <button class="multi-select-setter-action" data-testid="multi-select-command-bring-to-front" type="button" @click="emitCommand('bringToFront')">
          <BIcon icon="lucide:chevrons-up" :size="15" />
          <span>置顶</span>
        </button>
        <button class="multi-select-setter-action" data-testid="multi-select-command-send-to-back" type="button" @click="emitCommand('sendToBack')">
          <BIcon icon="lucide:chevrons-down" :size="15" />
          <span>置底</span>
        </button>
        <button class="multi-select-setter-action" data-testid="multi-select-command-bring-forward" type="button" @click="emitCommand('bringForward')">
          <BIcon icon="lucide:bring-to-front" :size="15" />
          <span>上一层</span>
        </button>
        <button class="multi-select-setter-action" data-testid="multi-select-command-send-backward" type="button" @click="emitCommand('sendBackward')">
          <BIcon icon="lucide:send-to-back" :size="15" />
          <span>下一层</span>
        </button>
      </div>
    </BSectionBlock>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { DrawingData, DrawingElement } from '@/components/BDrawing/types';
import { getDrawingElementGroupId } from '@/components/BDrawing/utils/drawingGroups';

/**
 * 多选快捷操作命令。
 */
type MultiSelectCommand = 'copy' | 'group' | 'ungroup' | 'bringToFront' | 'bringForward' | 'sendBackward' | 'sendToBack' | 'delete';

/**
 * 元素类型统计项。
 */
interface TypeSummary {
  /** 类型唯一键 */
  key: string;
  /** 类型名称 */
  label: string;
  /** 类型图标 */
  icon: string;
  /** 类型数量 */
  count: number;
}

/**
 * 元素外接框信息。
 */
interface SelectionBounds {
  /** 左上横坐标 */
  x: number;
  /** 左上纵坐标 */
  y: number;
  /** 外接框宽度 */
  width: number;
  /** 外接框高度 */
  height: number;
}

/**
 * 多选设置面板入参。
 */
interface Props {
  /** 当前画图数据 */
  drawingData: DrawingData;
  /** 当前选中的元素 ID 列表 */
  selectedElementIds: string[];
}

const props = defineProps<Props>();
const emit = defineEmits<{
  /** 触发多选快捷操作 */
  command: [command: MultiSelectCommand];
}>();

/**
 * 格式化几何数值。
 * @param value - 原始数值
 * @returns 展示文本
 */
function formatGeometryValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/**
 * 创建多选元素外接框。
 * @param elements - 当前多选元素
 * @returns 外接框信息，空选择返回 null
 */
function createSelectionBounds(elements: DrawingElement[]): SelectionBounds | null {
  if (!elements.length) {
    return null;
  }

  const left = Math.min(...elements.map((element: DrawingElement): number => element.position.x));
  const top = Math.min(...elements.map((element: DrawingElement): number => element.position.y));
  const right = Math.max(...elements.map((element: DrawingElement): number => element.position.x + element.size.width));
  const bottom = Math.max(...elements.map((element: DrawingElement): number => element.position.y + element.size.height));

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  };
}

/** 当前多选命中的元素，保持画布图层顺序。 */
const selectedElements = computed<DrawingElement[]>(() => {
  const selectedIds = new Set(props.selectedElementIds);

  return props.drawingData.elements.filter((element: DrawingElement): boolean => selectedIds.has(element.id));
});

/** 多选元素类型统计。 */
const typeSummaries = computed<TypeSummary[]>(() => {
  const summaryMap = new Map<string, TypeSummary>();

  selectedElements.value.forEach((element: DrawingElement): void => {
    const current = summaryMap.get(element.name);
    if (current) {
      current.count += 1;
      return;
    }

    summaryMap.set(element.name, {
      key: element.name,
      label: element.label,
      icon: element.icon,
      count: 1
    });
  });

  return Array.from(summaryMap.values());
});

/** 当前多选外接框。 */
const selectionBounds = computed<SelectionBounds | null>(() => createSelectionBounds(selectedElements.value));

/** 多选外接框展示文本。 */
const boundsText = computed<{ position: string; size: string }>(() => {
  if (!selectionBounds.value) {
    return {
      position: '-',
      size: '-'
    };
  }

  return {
    position: `${formatGeometryValue(selectionBounds.value.x)}, ${formatGeometryValue(selectionBounds.value.y)}`,
    size: `${formatGeometryValue(selectionBounds.value.width)} x ${formatGeometryValue(selectionBounds.value.height)}`
  };
});

/** 当前多选涉及的图层范围。 */
const layerRangeText = computed<string>(() => {
  const selectedIds = new Set(props.selectedElementIds);
  const indexes = props.drawingData.elements
    .map((element: DrawingElement, index: number): number => (selectedIds.has(element.id) ? index + 1 : -1))
    .filter((index: number): boolean => index > 0);
  if (!indexes.length) {
    return '-';
  }

  return `${Math.min(...indexes)} - ${Math.max(...indexes)}`;
});

/** 当前多选组合状态。 */
const groupStatusText = computed<string>(() => {
  const groupIds = selectedElements.value
    .map((element: DrawingElement): string | null => getDrawingElementGroupId(element))
    .filter((groupId: string | null): groupId is string => groupId !== null);
  if (!groupIds.length) {
    return '未组合';
  }

  const uniqueGroupIds = new Set(groupIds);
  if (uniqueGroupIds.size > 1) {
    return '多个组合';
  }

  return groupIds.length === selectedElements.value.length ? '同一组合' : '部分组合';
});

/**
 * 触发多选快捷操作。
 * @param command - 快捷操作命令
 */
function emitCommand(command: MultiSelectCommand): void {
  emit('command', command);
}
</script>

<style lang="less" scoped>
.multi-select-setter {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
  padding: 12px;
  overflow: auto;
}

.multi-select-setter-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 46px;
}

.multi-select-setter-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.multi-select-setter-subtitle {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.multi-select-setter-count {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 34px;
  height: 28px;
  padding: 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
}

.multi-select-setter-value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
}

.multi-select-setter-stat-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

:deep(.b-section-item.multi-select-setter-stat-item) {
  min-width: 0;
  min-height: 48px;
  padding: 8px 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
}

.multi-select-setter-stat-value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
}

.multi-select-setter-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.multi-select-setter-action {
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: center;
  min-width: 0;
  height: 32px;
  padding: 0 8px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
}

.multi-select-setter-action:hover {
  color: var(--text-primary);
  border-color: var(--color-primary);
}

.multi-select-setter-action.is-danger {
  color: var(--color-danger);
}
</style>
