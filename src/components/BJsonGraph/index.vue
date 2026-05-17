<template>
  <div class="b-json-graph">
    <div class="b-json-graph__panel b-json-graph__panel--source">
      <JsonSourceEditor
        ref="sourceEditorRef"
        v-model:value="content"
        :editable="editable"
        @update:value="handleSourceUpdate"
        @selection-change="handleSelectionChange"
        @editor-blur="emit('editor-blur', $event)"
      />
    </div>
    <BPanelSplitter v-model:size="graphWidth" position="right" :min-width="320" :max-width="720" />
    <div class="b-json-graph__panel b-json-graph__panel--graph" :style="{ width: `${graphWidth}px` }">
      <JsonNodeGraph
        :nodes="layout.nodes"
        :edges="layout.edges"
        :error="parseResult.error"
        :selected-path="currentPath"
        :auto-collapsed-count="layout.graphState.autoCollapsedPaths.size"
        @node-click="handleNodeClick"
        @toggle-collapse="toggleCollapse"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @file index.vue
 * @description JSON 图编辑器入口组件。
 */

import type { BJsonGraphPublicInstance } from './types';
import { computed, ref, watch } from 'vue';
import type { EditorController } from '@/components/BMarkdown/adapters/types';
import type { EditorState } from '@/components/BMarkdown/types';
import JsonNodeGraph from './components/NodeGraph.vue';
import JsonSourceEditor from './components/SourceEditor.vue';
import { buildJsonGraphLayout, createJsonGraphState } from './hooks/useGraphLayout';
import { parseJsonDocument } from './hooks/useJsonParse';
import { createSourceSync } from './hooks/useSourceSync';

interface Props {
  /** 是否可编辑。 */
  editable?: boolean;
}

withDefaults(defineProps<Props>(), {
  editable: true
});

const emit = defineEmits<{
  /** 双向绑定更新。 */
  (e: 'update:value', value: EditorState): void;
  /** 失焦事件。 */
  (e: 'editor-blur', event: FocusEvent): void;
}>();

const editorState = defineModel<EditorState>('value', {
  default: () => ({
    content: '',
    name: '',
    path: null,
    id: '',
    ext: 'json'
  })
});
const content = ref(editorState.value.content);
const graphWidth = ref<number>(460);
const sourceEditorRef = ref<InstanceType<typeof JsonSourceEditor> | null>(null);
const graphState = ref(createJsonGraphState());
const currentPath = ref<string | null>(null);
const currentNodeType = ref<string | null>(null);
const sourceSync = createSourceSync();

watch(
  () => editorState.value.content,
  (nextContent: string): void => {
    if (nextContent !== content.value) {
      content.value = nextContent;
    }
  }
);

watch(
  () => [editorState.value.id, editorState.value.path, editorState.value.ext] as const,
  (): void => {
    graphState.value = createJsonGraphState();
    currentPath.value = null;
    currentNodeType.value = null;
  }
);

/**
 * 解析 JSON 文档。
 */
const parseResult = computed(() => parseJsonDocument(content.value));

/**
 * 构造图布局。
 */
const layout = computed(() =>
  buildJsonGraphLayout({
    nodeMap: parseResult.value.nodeMap,
    graphState: graphState.value
  })
);

/**
 * 将内容同步回页面层。
 * @param nextContent - 最新内容
 */
function syncContent(nextContent: string): void {
  content.value = nextContent;
  editorState.value = {
    ...editorState.value,
    content: nextContent
  };
  emit('update:value', editorState.value);
}

/**
 * 处理源码编辑。
 * @param nextContent - 最新内容
 */
function handleSourceUpdate(nextContent: string): void {
  syncContent(nextContent);
}

/**
 * 根据选区更新当前路径。
 * @param selection - 当前选区
 */
function handleSelectionChange(selection: { from: number; to: number }): void {
  if (sourceSync.shouldSkipReverseSync()) {
    return;
  }

  const matchedNode = parseResult.value.findNodeAtOffset(selection.from);
  currentPath.value = matchedNode?.path ?? null;
  currentNodeType.value = matchedNode?.type ?? null;
  sourceSync.locateNodeFromEditor(selection.from);
}

/**
 * 节点点击后定位源码。
 * @param path - 节点路径
 */
function handleNodeClick(path: string): void {
  const node = parseResult.value.nodeMap.get(path);
  if (!node) {
    return;
  }

  const start = node.type === 'object' || node.type === 'array' ? node.startOffset : node.valueStartOffset;
  const end = node.type === 'object' || node.type === 'array' ? node.endOffset : node.valueEndOffset;

  currentPath.value = node.path;
  currentNodeType.value = node.type;
  sourceSync.locateSourceFromGraph(
    (rangeStart: number, rangeEnd: number): void => {
      sourceEditorRef.value?.dispatchSelection(rangeStart, rangeEnd);
    },
    start,
    end
  );
}

/**
 * 切换路径折叠状态。
 * @param path - 节点路径
 */
function toggleCollapse(path: string): void {
  if (graphState.value.userCollapsedPaths.has(path)) {
    graphState.value.userCollapsedPaths.delete(path);
    graphState.value.userExpandedPaths.add(path);
    return;
  }

  if (graphState.value.userExpandedPaths.has(path)) {
    graphState.value.userExpandedPaths.delete(path);
  }

  graphState.value.userCollapsedPaths.add(path);
}

/**
 * 获取当前路径。
 * @returns 当前路径
 */
function getCurrentPath(): string | null {
  return currentPath.value;
}

/**
 * 获取当前节点类型。
 * @returns 当前节点类型
 */
function getCurrentNodeType(): string | null {
  return currentNodeType.value;
}

/**
 * 按路径读取值。
 * @param path - JSON Pointer 路径
 * @returns JSON 值
 */
function getValueAtPath(path: string): unknown {
  return parseResult.value.getValueAtPath(path);
}

/**
 * 获取结构摘要。
 * @returns 结构摘要
 */
function getStructureSummary() {
  return parseResult.value.getStructureSummary();
}

/**
 * 获取内部源码控制器。
 * @returns 控制器
 */
function getSourceController(): EditorController | null {
  return sourceEditorRef.value;
}

defineExpose<BJsonGraphPublicInstance>({
  undo(): void {
    getSourceController()?.undo();
  },
  redo(): void {
    getSourceController()?.redo();
  },
  canUndo(): boolean {
    return getSourceController()?.canUndo() ?? false;
  },
  canRedo(): boolean {
    return getSourceController()?.canRedo() ?? false;
  },
  focusEditor(): void {
    getSourceController()?.focusEditor();
  },
  focusEditorAtStart(): void {
    getSourceController()?.focusEditorAtStart();
  },
  setSearchTerm(term: string): void {
    getSourceController()?.setSearchTerm(term);
  },
  findNext(): void {
    getSourceController()?.findNext();
  },
  findPrevious(): void {
    getSourceController()?.findPrevious();
  },
  clearSearch(): void {
    getSourceController()?.clearSearch();
  },
  getSelection() {
    return getSourceController()?.getSelection() ?? null;
  },
  async insertAtCursor(insertContent: string): Promise<void> {
    await getSourceController()?.insertAtCursor(insertContent);
  },
  async replaceSelection(replaceContent: string): Promise<void> {
    await getSourceController()?.replaceSelection(replaceContent);
  },
  async replaceDocument(replaceContent: string): Promise<void> {
    await getSourceController()?.replaceDocument(replaceContent);
  },
  selectLineRange(startLine: number, endLine: number): boolean | Promise<boolean> {
    return getSourceController()?.selectLineRange(startLine, endLine) ?? false;
  },
  getSearchState() {
    return getSourceController()?.getSearchState() ?? { currentIndex: 0, matchCount: 0, term: '' };
  },
  scrollToAnchor(): boolean {
    return false;
  },
  getActiveAnchorId(): string {
    return '';
  },
  getCurrentPath,
  getCurrentNodeType,
  getValueAtPath,
  getStructureSummary
});
</script>

<style scoped lang="less">
.b-json-graph {
  display: flex;
  height: 100%;
  overflow: hidden;
  background: var(--bg-primary);
  border-radius: 8px;
}

.b-json-graph__panel {
  min-width: 0;
}

.b-json-graph__panel--source {
  flex: 1;
  overflow: auto;
}

.b-json-graph__panel--graph {
  flex: 0 0 auto;
  min-width: 320px;
  border-left: 1px solid var(--json-node-border);
}
</style>
