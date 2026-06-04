<template>
  <div class="quick-actions">
    <BButton
      square
      size="small"
      type="ghost"
      :tooltip="showOutline ? '隐藏大纲' : '显示大纲'"
      :icon="showOutline ? 'lucide:list-tree' : 'lucide:list'"
      @click="toggleOutline"
    />
    <BButton
      square
      size="small"
      type="ghost"
      :tooltip="viewMode === 'rich' ? '切换源代码模式' : '切换预览模式'"
      :icon="viewMode === 'rich' ? 'lucide:file-text' : 'lucide:file-code-2'"
      @click="toggleViewMode"
    />

    <BDropdown>
      <BButton square size="small" type="ghost" @click.stop>
        <BIcon icon="lucide:ellipsis" :size="14" />
      </BButton>

      <template #overlay>
        <BDropdownMenu :options="menuOptions" :width="180" />
      </template>
    </BDropdown>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { DropdownOption } from '@/components/BDropdown/type';
import { useEditorPreferencesStore } from '@/stores/editor/preferences';

/**
 * QuickActions 组件 Props
 */
interface Props {
  /** 文件路径，用于判断某些菜单项是否可用 */
  filePath?: string | null;
}

const props = withDefaults(defineProps<Props>(), {
  filePath: null
});

const showOutline = defineModel<boolean>('show-outline', { default: false });
const viewMode = defineModel<string>('viewMode', { default: 'rich' });

const emit = defineEmits<{
  /** 重命名文件事件 */
  'rename-file': [];
  /** 保存文件事件 */
  save: [];
  /** 另存为事件 */
  'save-as': [];
  /** 导出 PDF 事件 */
  'export-pdf': [];
  /** 复制路径事件 */
  'copy-path': [];
  /** 在文件夹中显示事件 */
  'show-in-folder': [];
}>();

/**
 * 切换大纲显示状态
 */
function toggleOutline(): void {
  showOutline.value = !showOutline.value;
}

/**
 * 切换源代码模式和预览模式
 */
function toggleViewMode(): void {
  viewMode.value = viewMode.value === 'rich' ? 'source' : 'rich';
}

const editorPreferencesStore = useEditorPreferencesStore();

/**
 * 当前页宽模式，从偏好设置 store 中读取。
 */
const pageWidth = computed(() => editorPreferencesStore.pageWidth);

/**
 * 设置页宽模式。
 * @param width - 目标页宽模式
 */
function setPageWidth(width: string): void {
  editorPreferencesStore.setPageWidth(width as 'default' | 'wide' | 'full');
}

/**
 * 菜单选项配置
 * 根据文件路径动态计算菜单项的可用状态
 */
const menuOptions = computed<DropdownOption[]>(() => [
  {
    value: 'rename',
    label: '重命名',
    icon: 'lucide:pencil',
    onClick: () => emit('rename-file')
  },
  {
    value: 'save',
    label: '保存',
    icon: 'lucide:save',
    onClick: () => emit('save')
  },
  {
    value: 'save-as',
    label: '另存为',
    icon: 'lucide:save-all',
    onClick: () => emit('save-as')
  },
  {
    value: 'export-pdf',
    label: '导出 PDF',
    icon: 'lucide:file-output',
    onClick: () => emit('export-pdf')
  },
  {
    value: 'page-width',
    label: '视宽',
    icon: 'lucide:maximize',
    children: [
      {
        value: 'page-width-default',
        label: '默认',
        checked: pageWidth.value === 'default',
        onClick: () => setPageWidth('default')
      },
      {
        value: 'page-width-wide',
        label: '较宽',
        checked: pageWidth.value === 'wide',
        onClick: () => setPageWidth('wide')
      },
      {
        value: 'page-width-full',
        label: '全宽',
        checked: pageWidth.value === 'full',
        onClick: () => setPageWidth('full')
      }
    ]
  },
  {
    type: 'divider'
  },
  {
    value: 'copy-path',
    label: '复制路径',
    icon: 'lucide:copy',
    disabled: !props.filePath,
    onClick: () => emit('copy-path')
  },
  {
    value: 'reveal',
    label: '打开所在位置',
    icon: 'lucide:folder-open',
    disabled: !props.filePath,
    onClick: () => emit('show-in-folder')
  }
]);
</script>

<style scoped>
.quick-actions {
  display: flex;
  gap: 4px;
}
</style>
