<!--
  @file index.vue
  @description BSkill 入口组件，文件预览：支持文件系统模式（rootPath）和虚拟文件模式（virtualFiles）。
-->
<template>
  <div :class="bem()">
    <div :class="bem('body')">
      <BPanelSplitter v-show="showFileTree" position="right" :size="220" :min-width="160" :max-width="300" :closable="false">
        <FileTree :root-path="rootPath" :virtual-paths="virtualPaths" :selected-file-path="selectedFilePath" @select-file="selectFile" @loaded="onTreeLoaded" />
      </BPanelSplitter>

      <div :class="bem('pane')">
        <div :class="bem('header')">
          <span>{{ selectedFileName }}</span>
          <BButton v-if="fileState.status === 'success'" type="text" square size="small" title="复制内容" @click="copyContent">
            <Icon icon="lucide:copy" :width="12" />
          </BButton>
        </div>

        <BScrollbar :class="bem('content-wrapper')">
          <div v-if="fileState.status === 'loading'" :class="bem('empty')">正在读取文件…</div>
          <div v-else-if="fileState.status === 'error'" :class="bem('error')">
            {{ fileState.message }}
          </div>
          <pre v-else-if="fileState.status === 'success'" :class="bem('content')"><code>{{ fileState.content }}</code></pre>
        </BScrollbar>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @file index.vue
 * @description BSkill 入口组件，文件预览：支持文件系统模式（rootPath）和虚拟文件模式（virtualFiles）。
 */

import type { BSkillProps as Props } from './types';
import { computed, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { useClipboard } from '@/hooks/useClipboard';
import { native } from '@/shared/platform';
import { createNamespace } from '@/utils/namespace';
import FileTree from './components/FileTree.vue';

const [, bem] = createNamespace('skill');

const props = defineProps<Props>();

const emit = defineEmits<{
  (event: 'loaded', fileCount: number): void;
}>();

if (import.meta.env.DEV && props.rootPath && props.virtualFiles) {
  console.warn('[BSkill] rootPath 与 virtualFiles 互斥，同时传入时仅 virtualFiles 生效');
}

// ─── Types ───────────────────────────────────────────────────────────────────

type FileState = { status: 'idle' } | { status: 'loading' } | { status: 'success'; content: string } | { status: 'error'; message: string };

// ─── State ───────────────────────────────────────────────────────────────────

const { clipboard } = useClipboard();

const selectedFilePath = ref('');
const fileState = ref<FileState>({ status: 'idle' });
const treeFileCount = ref(0);

/** 请求版本号，用于丢弃过期的异步结果 */
let requestVersion = 0;

// ─── Derived ─────────────────────────────────────────────────────────────────

const virtualFileMap = computed<Map<string, string>>(() => {
  const map = new Map<string, string>();
  props.virtualFiles?.forEach((f) => map.set(f.path, f.content));
  return map;
});

const virtualPaths = computed<string[]>(() => [...virtualFileMap.value.keys()]);

const showFileTree = computed<boolean>(() => treeFileCount.value > 1);

const selectedFileName = computed<string>(() => selectedFilePath.value.split('/').at(-1) || '未选择文件');

// ─── File loading ─────────────────────────────────────────────────────────────

async function readContent(filePath: string): Promise<string> {
  if (props.virtualFiles) {
    const content = virtualFileMap.value.get(filePath);
    if (content === undefined) throw new Error('文件不在虚拟文件列表中');
    return content;
  }
  const { content } = await native.readFile(filePath);
  return content;
}

async function selectFile(filePath: string): Promise<void> {
  if (filePath === selectedFilePath.value) return;

  const version = ++requestVersion;
  selectedFilePath.value = filePath;
  fileState.value = { status: 'loading' };

  try {
    const content = await readContent(filePath);
    if (version !== requestVersion) return;
    fileState.value = { status: 'success', content };
  } catch (error) {
    if (version !== requestVersion) return;
    const message = error instanceof Error ? error.message : '无法预览该文件';
    fileState.value = { status: 'error', message };
  }
}

// ─── Event handlers ───────────────────────────────────────────────────────────

function onTreeLoaded(count: number): void {
  treeFileCount.value = count;
  emit('loaded', count);
  //
  props.initialFilePath && selectFile(props.initialFilePath);
}

function copyContent(): void {
  if (fileState.value.status !== 'success') return;
  clipboard(fileState.value.content, { successMessage: '内容已复制' });
}

// ─── Watchers ─────────────────────────────────────────────────────────────────

// 数据源切换时令飞行中的请求失效并重置状态
watch([() => props.rootPath, () => props.virtualFiles], () => {
  requestVersion++;
  selectedFilePath.value = '';
  fileState.value = { status: 'idle' };
});

// ─── Expose ───────────────────────────────────────────────────────────────────

defineExpose({
  selectFile,
  copyContent
});
</script>

<style scoped lang="less">
.b-skill {
  display: flex;
  flex: 1;
  min-height: 0;
  user-select: text;
}

.b-skill__body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--border-tertiary);
  border-radius: 6px;
}

.b-skill__pane {
  display: flex;
  flex: 1;
  flex-direction: column;
  width: 0;
  background: var(--bg-primary);
}

.b-skill__content-wrapper {
  flex: 1;
  min-height: 0;
}

.b-skill__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 36px;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-tertiary);
}

.b-skill__content {
  flex: 1;
  min-height: 0;
  padding: 12px;
  margin: 0;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-primary);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.b-skill__empty,
.b-skill__error {
  padding: 12px;
  font-size: 12px;
  color: var(--text-secondary);
}

.b-skill__error {
  color: var(--color-danger, #ff4d4f);
}
</style>
