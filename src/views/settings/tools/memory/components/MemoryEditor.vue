<!--
  @file MemoryEditor.vue
  @description 记忆内容编辑器组件，基于 CodeMirror 实现。当前为只读模式，未来可扩展为可编辑。
-->
<template>
  <div class="memory-editor">
    <div ref="editorHostRef" class="memory-editor__host"></div>
  </div>
</template>

<script setup lang="ts">
/**
 * @file MemoryEditor.vue
 * @description 记忆内容编辑器组件，基于 CodeMirror 实现。当前为只读模式，未来可扩展为可编辑。
 */
import type { Extension } from '@codemirror/state';
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

/**
 * 组件 props
 */
interface Props {
  /** 要展示的 Markdown 内容 */
  content: string;
}

const props = defineProps<Props>();

/** CodeMirror 挂载容器 */
const editorHostRef = ref<HTMLDivElement>();
/** 编辑器视图实例 */
const editorView = shallowRef<EditorView | null>(null);

/**
 * 创建 CodeMirror 主题扩展，匹配页面样式
 */
function createThemeExtension(): Extension {
  return EditorView.theme({
    '&': {
      height: '100%',
      color: 'var(--text-primary)',
      backgroundColor: 'var(--bg-secondary)',
      borderRadius: '8px',
      border: '1px solid var(--border-secondary)',
      fontSize: '12px'
    },
    '.cm-scroller': {
      fontFamily: "'Fira Code', 'JetBrains Mono', Consolas, Monaco, monospace",
      lineHeight: '1.6',
      overflow: 'auto',
      padding: '12px 16px'
    },
    '.cm-content': {
      padding: '0',
      caretColor: 'transparent'
    },
    '.cm-cursor': {
      display: 'none'
    },
    '.cm-focused': {
      outline: 'none'
    },
    '.cm-line': {
      padding: '0'
    },
    '.cm-gutters': {
      display: 'none'
    },
    '.cm-selectionBackground': {
      backgroundColor: 'transparent !important'
    }
  });
}

/**
 * 创建 CodeMirror 扩展列表
 * 当前为只读模式，未来可通过调整扩展切换为可编辑
 */
function createExtensions(): Extension[] {
  return [EditorState.readOnly.of(true), EditorView.editable.of(false), markdown(), EditorView.lineWrapping, createThemeExtension()];
}

/**
 * 初始化 CodeMirror 编辑器
 */
function initEditor(): void {
  if (!editorHostRef.value) return;

  const state = EditorState.create({
    doc: props.content,
    extensions: createExtensions()
  });

  editorView.value = new EditorView({
    state,
    parent: editorHostRef.value
  });
}

/**
 * 销毁 CodeMirror 编辑器
 */
function destroyEditor(): void {
  if (editorView.value) {
    editorView.value.destroy();
    editorView.value = null;
  }
}

/** 监听 content 变化，同步更新编辑器文档 */
watch(
  () => props.content,
  (newContent) => {
    if (!editorView.value) return;

    const currentDoc = editorView.value.state.doc.toString();
    if (currentDoc === newContent) return;

    editorView.value.dispatch({
      changes: {
        from: 0,
        to: editorView.value.state.doc.length,
        insert: newContent
      }
    });
  }
);

onMounted(() => {
  initEditor();
});

onBeforeUnmount(() => {
  destroyEditor();
});
</script>

<style scoped lang="less">
.memory-editor {
  min-height: 120px;
  max-height: 400px;
  overflow: hidden;
  border-radius: 8px;
}
</style>
