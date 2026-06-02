<!--
  @file SkillPreview.vue
  @description Skill 文件预览组件，支持文件系统模式（rootPath）和虚拟文件模式（virtualFiles）
-->
<template>
  <div class="skill-preview">
    <div class="skill-preview__body">
      <BPanelSplitter v-show="showFileTree" position="right" :size="220" :min-width="160" :max-width="300" :closable="false">
        <SkillFileTree
          :root-path="rootPath"
          :virtual-paths="virtualPaths"
          :selected-file-path="selectedFilePath"
          @select-file="selectFile"
          @loaded="onTreeLoaded"
        />
      </BPanelSplitter>

      <div class="skill-preview__preview">
        <div class="skill-preview__preview-header">
          <span>{{ selectedFileName }}</span>
          <BButton v-if="fileState.status === 'success'" type="text" square size="small" title="复制内容" @click="copyContent">
            <Icon icon="lucide:copy" :width="12" />
          </BButton>
        </div>

        <BScrollbar class="skill-preview__preview-body">
          <div v-if="fileState.status === 'loading'" class="skill-preview__preview-empty">正在读取文件…</div>
          <div v-else-if="fileState.status === 'error'" class="skill-preview__preview-error">
            {{ fileState.message }}
          </div>
          <pre v-else-if="fileState.status === 'success'" class="skill-preview__preview-content"><code>{{ fileState.content }}</code></pre>
        </BScrollbar>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { useClipboard } from '@/hooks/useClipboard';
import { native } from '@/shared/platform';
import SkillFileTree from './SkillFileTree.vue';

// ─── Types ───────────────────────────────────────────────────────────────────

/** 虚拟文件描述 */
export interface VirtualFile {
  path: string;
  content: string;
}

type FileState = { status: 'idle' } | { status: 'loading' } | { status: 'success'; content: string } | { status: 'error'; message: string };

interface Props {
  /** 文件系统根目录路径与 virtualFiles 互斥 */
  rootPath?: string;
  /** 虚拟文件列表（内存内容）与 rootPath 互斥 */
  virtualFiles?: VirtualFile[];
  /** 初始选中文件路径，树加载完成后自动选中 */
  initialFilePath?: string;
}

// ─── Props / Emits ───────────────────────────────────────────────────────────

const props = defineProps<Props>();

const emit = defineEmits<{
  (event: 'loaded', fileCount: number): void;
}>();

if (import.meta.env.DEV && props.rootPath && props.virtualFiles) {
  console.warn('[SkillPreview] rootPath 与 virtualFiles 互斥，同时传入时仅 virtualFiles 生效');
}

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
</script>

<style scoped lang="less">
.skill-preview {
  display: flex;
  flex: 1;
  min-height: 0;
  user-select: text;
}

.skill-preview__body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--border-tertiary);
  border-radius: 6px;
}

.skill-preview__preview {
  display: flex;
  flex: 1;
  flex-direction: column;
  width: 0;
  background: var(--bg-primary);
}

.skill-preview__preview-body {
  flex: 1;
  min-height: 0;
}

.skill-preview__preview-header {
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

.skill-preview__preview-content {
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

.skill-preview__preview-empty,
.skill-preview__preview-error {
  padding: 12px;
  font-size: 12px;
  color: var(--text-secondary);
}

.skill-preview__preview-error {
  color: var(--color-danger, #ff4d4f);
}
</style>
