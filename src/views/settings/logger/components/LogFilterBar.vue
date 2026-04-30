<!--
  @file LogFilterBar.vue
  @description 日志过滤工具栏，保留日志标题、记录总数、打开目录，以及关键词与日期筛选能力。
-->
<template>
  <div class="log-toolbar">
    <div class="log-header">
      <div class="log-header-title">
        <h3>运行日志</h3>
        <span class="log-header-count">共 {{ count }} 条记录</span>
      </div>
      <div class="log-header-actions">
        <BButton icon="lucide:folder-open" type="text" @click="logger.openLogFolder()"> 打开目录 </BButton>
      </div>
    </div>

    <div class="log-filter-bar">
      <BSelect v-model:value="dataItem.level" placeholder="日志级别" default-value="" :width="140" @change="handeChange">
        <ASelectOption value=""> 全部 </ASelectOption>
        <ASelectOption value="ERROR"> 错误 </ASelectOption>
        <ASelectOption value="WARN"> 警告 </ASelectOption>
        <ASelectOption value="INFO"> 信息 </ASelectOption>
      </BSelect>
      <AInput v-model:value="dataItem.keyword" placeholder="搜索日志内容..." allow-clear class="log-filter-bar__input" @change="handeChange" />

      <ADatePicker v-model:value="dataItem.date" placeholder="选择日期" class="log-filter-bar__date" value-format="YYYY-MM-DD" @change="handeChange" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { logger } from '@/shared/logger';
import type { LogLevel } from '@/shared/logger/types';

/**
 * 日志筛选栏数据对象。
 */
export interface LogFilterBarDataItem {
  /** 当前日志级别筛选。 */
  level: LogLevel | '';
  /** 当前关键词筛选。 */
  keyword: string;
  /** 当前日期筛选。 */
  date: string;
}
/**
 * 组件属性定义。
 */
interface Props {
  /** 当前页面已加载的日志条数。 */
  count?: number;
}

const dataItem = defineModel<LogFilterBarDataItem>('value', { required: true });

withDefaults(defineProps<Props>(), { count: 0 });

const emit = defineEmits(['change']);

/**
 * 处理筛选条件变更。
 */
function handeChange() {
  emit('change');
}
</script>

<style scoped lang="less">
.log-toolbar {
  padding: 0 20px;
}

.log-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 52px;
}

.log-header-title {
  display: flex;
  gap: 12px;
  align-items: baseline;
}

.log-header-title h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.log-header-count {
  font-size: 13px;
  color: var(--text-tertiary);
}

.log-header-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.log-filter-bar {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 16px;
  background: var(--bg-elevated);
  border-radius: 8px;
}

.log-filter-bar__date {
  width: 200px;
}
</style>
