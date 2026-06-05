<!--
  @file Monaco.vue
  @description Monaco 编辑器包装组件，聚合 BMonaco 并对外暴露统一的 EditorController 协议，包含工具栏支持自动换行切换。当内容为 JSON 时支持切换至 BJsonViewer 图形化查看。
-->
<template>
  <div class="b-monaco-layout">
    <!-- JSON 图形化查看视图 -->
    <BJsonViewer v-if="jsonViewerVisible" :content="content" />

    <!-- Monaco 编辑器 -->
    <BMonaco
      v-show="!jsonViewerVisible"
      ref="monacoRef"
      v-model:value="content"
      :editor-state="editorState"
      :language="language"
      :editable="editable"
      :options="monacoOptions"
      @editor-blur="emit('editor-blur', $event)"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * @file Monaco.vue
 * @description Monaco 编辑器包装组件，聚合 BMonaco 并对外暴露统一的 EditorController 协议，包含工具栏支持自动换行切换。当内容为 JSON 时支持切换至 BJsonViewer 图形化查看。
 */

import type { EditorController, EditorState } from './types';
import { computed, ref, watchEffect } from 'vue';
import BJsonViewer from '@/components/BJsonViewer/index.vue';
import BMonaco from '@/components/BMonaco/index.vue';
import { useEditorPreferencesStore } from '@/stores/editor/preferences';
import type { HeaderToolbarItem } from '@/stores/ui/headerToolbar';
import { useHeaderToolbarStore } from '@/stores/ui/headerToolbar';

/**
 * Monaco 组件入参。
 */
interface Props {
  /** 编辑器状态数据项，包含内容、文件名、路径等信息。 */
  editorState: EditorState;
  /** 是否可编辑。 */
  editable: boolean;
  /** 当前 Monaco 语言标识。 */
  language: string;
  /** 当前编辑器是否处于激活标签页。 */
  active?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  active: true
});

const emit = defineEmits<{
  'editor-blur': [event: FocusEvent];
}>();

const editorPreferencesStore = useEditorPreferencesStore();
const headerToolbarStore = useHeaderToolbarStore();
const monacoRef = ref<InstanceType<typeof BMonaco> | null>(null);
const headerToolbarOwnerId = computed<string>(() => `monaco:${props.editorState.id}`);

const content = defineModel<string>('content', { default: '' });

/** 当前自动换行状态，从偏好 store 中读取。 */
const wordWrap = computed<boolean>(() => editorPreferencesStore.monacoWordWrap === 'on');

/** 传递给 BMonaco 的运行时选项，跟随偏好动态变化。 */
const monacoOptions = computed(() => ({
  wordWrap: wordWrap.value
}));

/** 是否显示 JSON 图形化查看视图。 */
const jsonViewerVisible = ref<boolean>(false);

/** 当前内容是否为可查看的 JSON（语言为 json 且内容可解析）。 */
const isJsonViewable = computed<boolean>(() => {
  if (props.language !== 'json') {
    return false;
  }

  try {
    JSON.parse(content.value);
    return true;
  } catch {
    return false;
  }
});

/**
 * 切换自动换行模式。
 */
function toggleWordWrap(): void {
  editorPreferencesStore.setMonacoWordWrap(wordWrap.value ? 'off' : 'on');
}

/**
 * 切换 JSON 图形化查看视图。
 */
function toggleJsonViewer(): void {
  jsonViewerVisible.value = !jsonViewerVisible.value;
}

/**
 * 构建 Monaco 编辑器 Header 工具栏条目。
 * @returns Header 工具栏条目列表
 */
function buildMonacoHeaderToolbarItems(): HeaderToolbarItem[] {
  return [
    {
      type: 'action',
      key: 'monaco-json-viewer',
      icon: jsonViewerVisible.value ? 'lucide:code-2' : 'lucide:git-fork',
      tooltip: jsonViewerVisible.value ? '返回编辑器' : '图形化查看 JSON',
      active: jsonViewerVisible.value,
      visible: isJsonViewable.value,
      onClick: toggleJsonViewer
    },
    {
      type: 'action',
      key: 'monaco-word-wrap',
      icon: wordWrap.value ? 'lucide:wrap-text' : 'lucide:text',
      tooltip: wordWrap.value ? '关闭自动换行' : '开启自动换行',
      active: wordWrap.value,
      onClick: toggleWordWrap
    }
  ];
}

watchEffect((onCleanup): void => {
  const ownerId = headerToolbarOwnerId.value;

  if (!props.active) {
    headerToolbarStore.unregister(ownerId);
    return;
  }

  headerToolbarStore.register(ownerId, buildMonacoHeaderToolbarItems());
  onCleanup((): void => headerToolbarStore.unregister(ownerId));
});

/**
 * 将 BMonaco 实例作为统一 EditorController 暴露给父组件。
 */
const editorController = computed<EditorController>(() => monacoRef.value as unknown as EditorController);

defineExpose({
  editorController
});
</script>

<style lang="less">
.b-monaco-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-primary);
}
</style>
