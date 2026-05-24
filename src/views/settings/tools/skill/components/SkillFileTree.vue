<!--
  @file SkillFileTree.vue
  @description Skill 文件树组件，支持目录折叠/展开，默认全部展开。
-->
<template>
  <div class="skill-file-tree" aria-label="Skill 文件树">
    <div v-if="loading" class="skill-file-tree__empty">正在加载文件…</div>
    <div v-else-if="error" class="skill-file-tree__error">{{ error }}</div>
    <div v-else-if="nodes.length === 0" class="skill-file-tree__empty">未发现文件</div>
    <template v-else>
      <button
        v-for="node in visibleNodes"
        :key="node.path"
        class="skill-file-tree__node"
        :class="{
          'skill-file-tree__node--directory': node.type === 'directory',
          'skill-file-tree__node--active': selectedFilePath === node.path,
          'skill-file-tree__node--collapsed': node.type === 'directory' && collapsedPaths.has(node.path)
        }"
        :style="{ paddingLeft: `${12 + node.depth * 14}px` }"
        :data-test="node.type === 'file' ? `skill-file-${node.path}` : undefined"
        @click="handleNodeClick(node)"
      >
        <Icon
          v-if="node.type === 'directory'"
          :icon="collapsedPaths.has(node.path) ? 'lucide:chevron-right' : 'lucide:chevron-down'"
          :width="12"
          class="skill-file-tree__chevron"
        />
        <span v-else-if="hasDirectories" class="skill-file-tree__chevron-placeholder"></span>
        <Icon :icon="getNodeIcon(node)" :width="14" class="skill-file-tree__icon" />
        <span>{{ node.name }}</span>
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * @file SkillFileTree.vue
 * @description Skill 文件树组件，支持目录折叠/展开，默认全部展开。
 */

import { computed, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { native } from '@/shared/platform';
import type { ReadWorkspaceDirectoryEntry } from '@/shared/platform/native/types';
import { getFileIcon } from '@/utils/file/icons';

/**
 * 文件树节点。
 */
interface FileTreeNode {
  /** 文件或目录名称。 */
  name: string;
  /** 文件或目录绝对路径。 */
  path: string;
  /** 节点类型。 */
  type: 'file' | 'directory';
  /** 相对根目录的展示层级。 */
  depth: number;
}

interface Props {
  /** 根目录路径，为空时不加载。 */
  rootPath: string;
  /** 当前选中文件路径。 */
  selectedFilePath: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  /**
   * 选中文件时触发。
   * @param event - 事件名
   * @param filePath - 选中的文件路径
   */
  (event: 'select-file', filePath: string): void;
  /**
   * 文件树加载完成时触发。
   * @param event - 事件名
   * @param fileCount - 文件数量（不含目录）
   */
  (event: 'loaded', fileCount: number): void;
}>();

/** 全量扁平节点列表。 */
const nodes = ref<FileTreeNode[]>([]);
const loading = ref(false);
const error = ref('');
/** 已折叠的目录路径集合，默认为空即全部展开。 */
const collapsedPaths = ref<Set<string>>(new Set());
let requestId = 0;

/** 树中是否包含目录节点，用于决定是否显示对齐占位符。 */
const hasDirectories = computed<boolean>(() => nodes.value.some((n) => n.type === 'directory'));

/**
 * 根据折叠状态过滤出可见节点。
 * 遍历扁平列表，若某目录已折叠，则跳过其下所有子节点（depth 更深且紧随其后的节点）。
 */
const visibleNodes = computed<FileTreeNode[]>(() => {
  const result: FileTreeNode[] = [];
  /** 当前被折叠的目录深度栈，用于判断节点是否处于折叠目录内 */
  let skipDepth = -1;

  for (const node of nodes.value) {
    if (skipDepth >= 0 && node.depth > skipDepth) {
      // 当前节点处于被折叠的目录内，跳过
      continue;
    }
    // 退出折叠目录范围
    skipDepth = -1;
    result.push(node);

    // 若当前目录节点已折叠，则标记其子节点需要跳过
    if (node.type === 'directory' && collapsedPaths.value.has(node.path)) {
      skipDepth = node.depth;
    }
  }

  return result;
});

/**
 * 按目录优先、名称升序排序。
 * @param entries - 目录项列表
 * @returns 排序后的目录项
 */
function sortEntries(entries: ReadWorkspaceDirectoryEntry[]): ReadWorkspaceDirectoryEntry[] {
  return [...entries].sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === 'directory' ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });
}

/**
 * 递归读取目录并生成扁平文件树节点。
 * @param directoryPath - 当前目录路径
 * @param depth - 当前目录层级
 * @returns 文件树节点列表
 */
async function collectTreeNodes(directoryPath: string, depth: number): Promise<FileTreeNode[]> {
  const { entries } = await native.readWorkspaceDirectory({ directoryPath });
  const nodeGroups = await Promise.all(
    sortEntries(entries).map(async (entry): Promise<FileTreeNode[]> => {
      const node: FileTreeNode = {
        name: entry.name,
        path: entry.path,
        type: entry.type,
        depth
      };

      if (entry.type !== 'directory') {
        return [node];
      }

      const childNodes = await collectTreeNodes(entry.path, depth + 1);
      return [node, ...childNodes];
    })
  );

  return nodeGroups.flat();
}

/**
 * 加载文件树。
 */
async function loadTree(): Promise<void> {
  if (!props.rootPath) {
    nodes.value = [];
    emit('loaded', 0);
    return;
  }

  const currentRequestId = ++requestId;
  loading.value = true;
  error.value = '';
  nodes.value = [];
  collapsedPaths.value = new Set();

  try {
    const result = await collectTreeNodes(props.rootPath, 0);
    if (currentRequestId !== requestId) {
      return;
    }
    nodes.value = result;
    emit('loaded', result.filter((n) => n.type === 'file').length);
  } catch (err: unknown) {
    if (currentRequestId !== requestId) {
      return;
    }
    error.value = err instanceof Error ? err.message : '无法加载 Skill 文件树。';
  } finally {
    if (currentRequestId === requestId) {
      loading.value = false;
    }
  }
}

/**
 * 获取节点图标名：目录区分展开/折叠，文件按扩展名匹配。
 * @param node - 文件树节点
 * @returns Iconify 图标名
 */
function getNodeIcon(node: FileTreeNode): string {
  if (node.type === 'directory') {
    return collapsedPaths.value.has(node.path) ? 'lucide:folder' : 'lucide:folder-open';
  }
  return getFileIcon(node.name.split('.').pop() ?? '');
}

/**
 * 处理节点点击：目录切换折叠，文件触发选中。
 * @param node - 当前点击的节点
 */
function handleNodeClick(node: FileTreeNode): void {
  if (node.type === 'directory') {
    const next = new Set(collapsedPaths.value);
    if (next.has(node.path)) {
      next.delete(node.path);
    } else {
      next.add(node.path);
    }
    collapsedPaths.value = next;
    return;
  }
  emit('select-file', node.path);
}

watch(
  () => props.rootPath,
  () => {
    loadTree().catch((err: unknown) => {
      console.error('Skill tree load failed:', err);
    });
  },
  { immediate: true }
);
</script>

<style scoped lang="less">
.skill-file-tree {
  min-width: 0;
  height: 100%;
  padding: 4px 6px 6px;
  overflow: auto;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-tertiary);
}

.skill-file-tree__node {
  display: flex;
  gap: 6px;
  align-items: center;
  width: 100%;
  height: 30px;
  padding-right: 8px;
  overflow: hidden;
  font-size: 12px;
  color: var(--text-secondary);
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 6px;

  span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &:hover:not(.skill-file-tree__node--directory),
  &--active {
    color: var(--text-primary);
    background: var(--bg-tertiary);
  }

  &--directory {
    font-weight: 600;
    color: var(--text-tertiary);

    &:hover {
      color: var(--text-secondary);
      background: var(--bg-tertiary);
    }
  }

  & + & {
    margin-top: 2px;
  }
}

.skill-file-tree__icon {
  flex-shrink: 0;
}

/** 折叠箭头 */
.skill-file-tree__chevron {
  flex-shrink: 0;
}

/** 非目录节点的箭头占位，保持图标对齐 */
.skill-file-tree__chevron-placeholder {
  display: inline-block;
  flex-shrink: 0;
  width: 12px;
}

.skill-file-tree__empty,
.skill-file-tree__error {
  padding: 12px;
  font-size: 12px;
  color: var(--text-secondary);
}

.skill-file-tree__error {
  color: var(--color-danger, #ff4d4f);
}
</style>
