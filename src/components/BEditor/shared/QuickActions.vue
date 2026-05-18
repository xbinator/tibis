<template>
  <div class="quick-actions">
    <BDropdown>
      <BButton square size="small" type="text" class="quick-actions__trigger" @click.stop>
        <Icon icon="lucide:ellipsis" width="14" height="14" />
      </BButton>

      <template #overlay>
        <BDropdownMenu :options="menuOptions" :width="180" />
      </template>
    </BDropdown>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import type { DropdownOption } from '@/components/BDropdown/type';

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
    type: 'divider'
  },
  {
    value: 'toggle-outline',
    label: showOutline.value ? '隐藏大纲' : '显示大纲',
    icon: showOutline.value ? 'lucide:eye-off' : 'lucide:eye',
    onClick: toggleOutline
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
    type: 'divider'
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
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 10;
}

.quick-actions__trigger {
  color: var(--text-secondary);
  transition: color 0.15s ease;
}

.quick-actions__trigger:hover {
  color: var(--text-primary);
}
</style>
