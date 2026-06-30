<!--
  @file index.vue
  @description 通用分页组件，统一分页按钮样式。
-->
<template>
  <div v-if="shouldShow" :class="bem()">
    <APagination v-model:current="currentPage" :total="total" :page-size="pageSize">
      <template #itemRender="{ type, originalElement }">
        <BButton v-if="type === 'prev'" icon="lucide:chevron-left" square size="small" type="outline" />
        <BButton v-else-if="type === 'next'" icon="lucide:chevron-right" square size="small" type="outline" />
        <component :is="originalElement" v-else />
      </template>
    </APagination>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { createNamespace } from '@/utils/namespace';

/**
 * 分页组件属性。
 */
interface BPaginationProps {
  /** 数据总数。 */
  total: number;
  /** 每页显示数量。 */
  pageSize?: number;
}

const [, bem] = createNamespace('pagination');

const props = withDefaults(defineProps<BPaginationProps>(), {
  pageSize: 10
});

/** 当前页码。 */
const currentPage = defineModel<number>('current', { default: 1 });

/** 是否需要展示分页。 */
const shouldShow = computed<boolean>(() => props.total > props.pageSize);
</script>

<style scoped lang="less">
.b-pagination {
  display: flex;
  justify-content: flex-end;
}

.b-pagination :deep(.ant-pagination-item),
.b-pagination :deep(.ant-pagination-next),
.b-pagination :deep(.ant-pagination-prev) {
  min-width: 28px;
  height: 28px;
  line-height: 28px;
}
</style>
