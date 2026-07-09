<!--
  @file SchemaInputEditor.vue
  @description Widget页面 Schema JSON 编辑弹窗。
-->
<template>
  <BModal v-model:open="open" title="编辑" :width="640" @cancel="handleEditorCancel">
    <div class="schema-editor">
      <div class="schema-editor__host">
        <BMonaco
          ref="schemaInputEditorRef"
          v-model:value="schemaDraftText"
          language="json"
          :editable="true"
          :editor-state="schemaEditorState"
          :options="{ wordWrap: true, search: false }"
        />
      </div>
      <p v-if="schemaInputEditorError" class="schema-editor__error">
        {{ schemaInputEditorError }}
      </p>
    </div>

    <template #footer>
      <BButton type="secondary" @click="handleEditorCancel">取消</BButton>
      <BButton type="primary" @click="handleEditorConfirm">保存</BButton>
    </template>
  </BModal>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { EditorState } from '@/components/BEditor/types';
import BMonaco from '@/components/BMonaco/index.vue';
import type { WidgetSchemaObject } from '@/components/BWidget/types';
import { createDefaultWidgetSchemaObject, normalizeWidgetSchemaObject } from '@/components/BWidget/utils/widgetData';

/**
 * Schema 编辑弹窗入参。
 */
interface Props {
  /** 当前 schema 值 */
  schema: WidgetSchemaObject;
}

/**
 * JSON 对象记录，用于校验 schema 顶层格式。
 */
interface JsonObjectRecord {
  /** 顶层 schema 类型 */
  type?: unknown;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  /** 提交标准化后的 schema */
  confirm: [schema: WidgetSchemaObject];
}>();
const open = defineModel<boolean>('open', { required: true });

/** Schema 编辑器草稿文本。 */
const schemaDraftText = ref('');
/** Schema 输入编辑器校验错误提示。 */
const schemaInputEditorError = ref('');
/** Schema 输入 Monaco 编辑器实例。 */
const schemaInputEditorRef = ref<InstanceType<typeof BMonaco> | null>(null);

/**
 * 判断值是否为普通 JSON 对象。
 * @param value - 待判断值
 * @returns 是否为 JSON 对象
 */
function isJsonObjectRecord(value: unknown): value is JsonObjectRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 格式化 schema 为可编辑 JSON 文本。
 * @param schema - schema 对象
 * @returns JSON 文本
 */
function formatSchemaText(schema: WidgetSchemaObject): string {
  return JSON.stringify(schema, null, 2);
}

/**
 * 解析 schema 编辑器文本。
 * @param value - JSON 文本
 * @returns 标准化后的对象 schema
 */
function parseSchemaText(value: string): WidgetSchemaObject {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return createDefaultWidgetSchemaObject();
  }

  const parsed = JSON.parse(trimmedValue) as unknown;
  if (!isJsonObjectRecord(parsed) || parsed.type !== 'object') {
    throw new Error('Schema must be an object JSON schema.');
  }

  return normalizeWidgetSchemaObject(parsed);
}

/**
 * 聚焦 Schema 输入编辑器。
 */
function focusSchemaInputEditor(): void {
  if (!schemaInputEditorRef.value || typeof schemaInputEditorRef.value.focusEditor !== 'function') {
    return;
  }

  schemaInputEditorRef.value.focusEditor();
}

/**
 * 使用当前 schema 重置编辑草稿。
 * @returns 异步完成信号
 */
async function resetSchemaDraft(): Promise<void> {
  schemaDraftText.value = formatSchemaText(props.schema);
  schemaInputEditorError.value = '';

  await nextTick();
  focusSchemaInputEditor();
}

/**
 * 关闭 Schema 编辑弹窗。
 */
function handleEditorCancel(): void {
  open.value = false;
  schemaInputEditorError.value = '';
}

/**
 * 保存 Schema 编辑器内容。
 */
function handleEditorConfirm(): void {
  try {
    const schema = parseSchemaText(schemaDraftText.value);
    emit('confirm', schema);
    open.value = false;
    schemaInputEditorError.value = '';
  } catch (_error: unknown) {
    schemaInputEditorError.value = 'Schema 必须是合法 JSON 对象';
  }
}

watch(open, async (isOpen: boolean): Promise<void> => {
  if (!isOpen) {
    return;
  }

  await resetSchemaDraft();
});

watch(
  (): WidgetSchemaObject => props.schema,
  async (): Promise<void> => {
    if (!open.value) {
      return;
    }

    await resetSchemaDraft();
  }
);

/** Schema 编辑器状态。 */
const schemaEditorState = computed<EditorState>(() => ({
  id: 'widget-schema',
  name: 'schema.json',
  path: null,
  ext: 'json',
  content: schemaDraftText.value
}));
</script>

<style lang="less" scoped>
.schema-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.schema-editor__host {
  position: relative;
  min-height: 320px;
  padding: 1px;
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 6px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.schema-editor__host:hover {
  border-color: var(--border-hover);
}

.schema-editor__host:focus-within {
  border-color: var(--input-focus-border);
  box-shadow: 0 0 0 2px var(--input-focus-shadow);
}

.schema-editor__host :deep(.b-editor-monaco),
.schema-editor__host :deep(.b-editor-monaco__host) {
  min-height: 320px;
}

.schema-editor__host :deep(.monaco-editor),
.schema-editor__host :deep(.monaco-editor-background) {
  background: var(--input-bg);
}

.schema-editor__host :deep(.monaco-editor .margin),
.schema-editor__host :deep(.monaco-editor .monaco-editor-background) {
  background: var(--input-bg);
}

.schema-editor__host :deep(.monaco-editor .view-lines) {
  font-family: var(--font-family-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace);
}

.schema-editor__error {
  margin: 0;
  font-size: 12px;
  color: var(--color-danger, #ef4444);
}
</style>
