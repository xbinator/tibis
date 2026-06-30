<!--
  @file SettingsPagination.vue
  @description 设置模块私有分页容器，承接列表底部分页的间距与分割线。
-->
<template>
  <div v-if="shouldShow" class="settings-pagination">
    <BPagination v-model:current="currentPage" :total="total" :page-size="pageSize" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

defineOptions({ name: 'SettingsPagination' });

/**
 * 设置页分页容器属性。
 */
interface SettingsPaginationProps {
  /** 数据总数。 */
  total: number;
  /** 每页显示数量。 */
  pageSize?: number;
}

const props = withDefaults(defineProps<SettingsPaginationProps>(), {
  pageSize: 10
});

/** 当前页码。 */
const currentPage = defineModel<number>('current', { default: 1 });

/** 是否需要展示分页容器。 */
const shouldShow = computed<boolean>(() => props.total > props.pageSize);
</script>

<style scoped lang="less">
.settings-pagination {
  display: flex;
  justify-content: flex-end;
  padding: 12px 20px;
  border-top: 1px solid var(--border-tertiary);
}
</style>
