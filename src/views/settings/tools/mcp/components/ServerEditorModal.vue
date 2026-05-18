<template>
  <BModal v-model:open="modalOpen" :title="modalTitle" :width="640" @cancel="handleCancel">
    <div class="server-editor-modal">
      <div class="server-editor-modal__hint">粘贴 JSON 配置</div>
      <div ref="editorHostRef" class="server-editor-modal__editor"></div>
      <div v-if="parseError" class="server-editor-modal__error">{{ parseError }}</div>
    </div>

    <template #footer>
      <BButton type="secondary" @click="handleCancel">取消</BButton>
      <BButton type="primary" :disabled="!parsedDraft || !!parseError" @click="handleConfirm">保存</BButton>
    </template>
  </BModal>
</template>

<script setup lang="ts">
/**
 * @file ServerEditorModal.vue
 * @description MCP Server 添加/编辑弹窗，内置 CodeMirror JSON 编辑器与格式校验。
 */
import type { MCPServerEditorDraft } from './server-editor';
import type { Extension } from '@codemirror/state';
import type { ViewUpdate } from '@codemirror/view';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { json } from '@codemirror/lang-json';
import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers, placeholder } from '@codemirror/view';
import type { MCPServerConfig } from '@/shared/storage/tool-settings';
import { MCP_SERVER_JSON_PLACEHOLDER, parseMCPServerEditorDraft, serializeMCPServerEditorDraft } from './server-editor';

interface Props {
  /** 弹窗是否打开 */
  open: boolean;
  /** 当前编辑的 server，空时为新增模式 */
  server?: MCPServerConfig | null;
}

const props = withDefaults(defineProps<Props>(), {
  server: null
});

const emit = defineEmits<{
  /**
   * 更新弹窗开关状态。
   * @param event - 事件名
   * @param value - 是否打开
   */
  (event: 'update:open', value: boolean): void;
  /**
   * 用户确认保存当前 JSON 草稿。
   * @param event - 事件名
   * @param draft - 解析后的草稿
   */
  (event: 'confirm', draft: MCPServerEditorDraft): void;
  /**
   * 用户取消编辑。
   * @param event - 事件名
   */
  (event: 'cancel'): void;
}>();

const modalOpen = computed<boolean>({
  /**
   * 读取弹窗开关状态。
   * @returns 是否打开
   */
  get(): boolean {
    return props.open;
  },
  /**
   * 同步弹窗开关状态给父层。
   * @param value - 是否打开
   */
  set(value: boolean): void {
    emit('update:open', value);
  }
});

const modalTitle = computed<string>(() => (props.server ? '编辑 MCP Server' : '添加 MCP Server'));
const editorHostRef = ref<HTMLDivElement | null>(null);
const editorView = shallowRef<EditorView | null>(null);
const jsonText = ref('');

const parseResult = computed(() => parseMCPServerEditorDraft(jsonText.value));
const parsedDraft = computed<MCPServerEditorDraft | null>(() => parseResult.value.draft);
const parseError = computed<string>(() => parseResult.value.error);

/**
 * 创建 CodeMirror 编辑器扩展。
 * @returns 编辑器扩展列表
 */
function createEditorExtensions(): Extension[] {
  return [
    lineNumbers(),
    json(),
    EditorView.lineWrapping,
    placeholder(MCP_SERVER_JSON_PLACEHOLDER),
    EditorView.contentAttributes.of({ spellcheck: 'false', 'aria-label': 'MCP Server JSON Editor' }),
    EditorView.theme({
      '&': {
        minHeight: '320px',
        fontSize: '12px'
      },
      '.cm-scroller': {
        minHeight: '320px',
        overflow: 'auto',
        fontFamily: 'var(--font-family-mono, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace)',
        lineHeight: '1.6'
      },
      '.cm-content': {
        padding: '12px 0',
        caretColor: 'var(--text-primary)'
      },
      '.cm-line': {
        padding: '0'
      },
      '.cm-focused': {
        outline: 'none'
      },
      '.cm-cursor': {
        borderLeft: '1.2px solid var(--color-primary, #4080ff)',
        marginLeft: '-0.6px',
        pointerEvents: 'none',
        position: 'relative',
        height: '1.2em'
      },
      '.cm-placeholder': {
        color: 'var(--text-placeholder)',
        fontStyle: 'normal'
      },
      '.cm-gutters': {
        borderTopLeftRadius: '8px',
        borderBottomLeftRadius: '8px',
        backgroundColor: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border-tertiary)'
      }
    }),
    EditorView.updateListener.of((update: ViewUpdate): void => {
      if (!update.docChanged) {
        return;
      }

      jsonText.value = update.state.doc.toString();
    })
  ];
}

/**
 * 将最新文本同步到 CodeMirror 文档。
 * @param nextText - 目标 JSON 文本
 */
function syncEditorDocument(nextText: string): void {
  const view = editorView.value;
  if (!view || view.state.doc.toString() === nextText) {
    return;
  }

  view.dispatch({
    changes: {
      from: 0,
      to: view.state.doc.length,
      insert: nextText
    }
  });
}

/**
 * 根据当前模式重置编辑器内容。
 */
function resetEditorContent(): void {
  const nextText = serializeMCPServerEditorDraft(props.server ?? null);
  jsonText.value = nextText;
  syncEditorDocument(nextText);
}

/**
 * 聚焦 CodeMirror 编辑器。
 */
function focusEditor(): void {
  editorView.value?.focus();
}

/**
 * 处理取消操作。
 */
function handleCancel(): void {
  emit('cancel');
  emit('update:open', false);
}

/**
 * 处理确认保存操作。
 */
function handleConfirm(): void {
  if (!parsedDraft.value || parseError.value) {
    return;
  }

  emit('confirm', parsedDraft.value);
}

onMounted(() => {
  if (!editorHostRef.value) {
    return;
  }

  const initialText = serializeMCPServerEditorDraft(props.server ?? null);
  jsonText.value = initialText;
  editorView.value = new EditorView({
    state: EditorState.create({
      doc: initialText,
      extensions: createEditorExtensions()
    }),
    parent: editorHostRef.value
  });
});

onBeforeUnmount(() => {
  editorView.value?.destroy();
  editorView.value = null;
});

watch(
  () => [props.open, props.server] as const,
  async ([open]): Promise<void> => {
    if (!open) {
      return;
    }

    // 每次打开弹窗时都回填最新 server 配置，避免连续编辑时残留上次输入。
    resetEditorContent();
    await nextTick();
    focusEditor();
  }
);
</script>

<style scoped lang="less">
.server-editor-modal {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.server-editor-modal__hint {
  font-size: 12px;
  color: var(--text-secondary);
}

.server-editor-modal__editor {
  position: relative;
  min-height: 320px;
  padding: 1px;
  overflow: hidden;
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 6px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.server-editor-modal__editor:hover {
  border-color: var(--border-hover);
}

.server-editor-modal__editor:focus-within {
  border-color: var(--input-focus-border);
  box-shadow: 0 0 0 2px var(--input-focus-shadow);
}

.server-editor-modal__editor :deep(.cm-editor) {
  min-height: 320px;
  outline: none;
  background: var(--input-bg);
}

.server-editor-modal__editor :deep(.cm-scroller) {
  font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
}

.server-editor-modal__editor :deep(.cm-gutters) {
  color: var(--text-tertiary);
  background: transparent;
  border-right: 1px solid var(--border-secondary);
}

.server-editor-modal__editor :deep(.cm-content) {
  padding: 12px 0;
}

.server-editor-modal__editor :deep(.cm-line) {
  white-space: pre-wrap;
}

.server-editor-modal__editor :deep(.cm-focused) {
  outline: none;
}

.server-editor-modal__error {
  font-size: 12px;
  color: var(--color-error);
}
</style>
