<!--
  @file MethodEditor.vue
  @description Widget页面交互脚本代码编辑弹窗。
-->
<template>
  <BModal v-model:open="open" :title="WIDGET_INTERACTION_SCRIPT_EDITOR_TITLE" :width="860" @close="handleEditorCancel">
    <div class="method-editor">
      <div class="method-editor__host">
        <BMonaco
          ref="methodEditorRef"
          v-model:value="methodCodeDraft"
          language="typescript"
          :editable="true"
          :editor-state="methodEditorState"
          :extra-libs="widgetMethodScriptExtraLibs"
          :options="{ wordWrap: true, search: true, stickyScroll: true, typescriptCompilerOptions: widgetMethodScriptCompilerOptions }"
        />
      </div>
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
import type { MonacoCompilerOptions, MonacoExtraLib } from '@/components/BMonaco/utils/createMonaco';
import type { WidgetSchemaObject, WidgetSchemaProperty } from '@/components/BWidget/types';
import { buildWidgetStateSchema } from '@/components/BWidget/utils/widgetStateSchema';
import { WIDGET_INTERACTION_SCRIPT_EDITOR_TITLE } from '../../constants/pageSetter';

/**
 * 交互脚本编辑弹窗入参。
 */
interface Props {
  /** 当前交互脚本代码 */
  code: string;
  /** 当前小组件入参 schema */
  inputSchema: WidgetSchemaObject;
}

/** TypeScript 标识符匹配表达式。 */
const TYPESCRIPT_IDENTIFIER_PATTERN = /^[A-Za-z_$][\w$]*$/;
/** TypeScript 声明缩进文本。 */
const TYPESCRIPT_DECLARATION_INDENT = '  ';

const props = defineProps<Props>();

/**
 * Widget schema 字段类型表达式读取函数。
 */
type WidgetSchemaPropertyTypeExpressionReader = (property: WidgetSchemaProperty, indentLevel: number) => string;

/**
 * 生成指定层级的 TypeScript 缩进。
 * @param level - 缩进层级
 * @returns 缩进文本
 */
function createTypeScriptIndent(level: number): string {
  return TYPESCRIPT_DECLARATION_INDENT.repeat(level);
}

/**
 * 生成可用于 TypeScript 属性声明的字段名。
 * @param key - schema 字段名
 * @returns TypeScript 属性名
 */
function formatTypeScriptPropertyName(key: string): string {
  return TYPESCRIPT_IDENTIFIER_PATTERN.test(key) ? key : JSON.stringify(key);
}

/**
 * 清理可写入 JSDoc 的说明文本。
 * @param text - 原始说明
 * @returns 安全说明文本
 */
function sanitizeTypeScriptDocText(text: string): string {
  return text.replaceAll('*/', '*\\/').replace(/\s+/g, ' ').trim();
}

/**
 * 生成 schema 字段的 JSDoc 行。
 * @param property - schema 字段
 * @param indentLevel - 缩进层级
 * @returns JSDoc 行
 */
function createWidgetSchemaPropertyDocLines(property: WidgetSchemaProperty, indentLevel: number): string[] {
  if (!property.description) {
    return [];
  }

  return [`${createTypeScriptIndent(indentLevel)}/** ${sanitizeTypeScriptDocText(property.description)} */`];
}

/**
 * 生成 schema 接口的 JSDoc 行。
 * @param schema - Widget schema
 * @returns JSDoc 行
 */
function createWidgetSchemaInterfaceDocLines(schema: WidgetSchemaObject): string[] {
  if (!schema.description) {
    return [];
  }

  return [`/** ${sanitizeTypeScriptDocText(schema.description)} */`];
}

/**
 * 将 Widget schema properties 转换为 TypeScript 属性声明。
 * @param properties - schema 字段集合
 * @param requiredFields - 必填字段列表
 * @param indentLevel - 缩进层级
 * @param readTypeExpression - 字段类型表达式读取函数
 * @returns TypeScript 属性声明行
 */
function createWidgetSchemaPropertyLines(
  properties: Record<string, WidgetSchemaProperty>,
  requiredFields: string[],
  indentLevel: number,
  readTypeExpression: WidgetSchemaPropertyTypeExpressionReader
): string[] {
  return Object.entries(properties).flatMap(([key, property]: [string, WidgetSchemaProperty]): string[] => {
    const optionalFlag = requiredFields.includes(key) ? '' : '?';
    const propertyName = formatTypeScriptPropertyName(key);
    const typeExpression = readTypeExpression(property, indentLevel);

    return [
      ...createWidgetSchemaPropertyDocLines(property, indentLevel),
      `${createTypeScriptIndent(indentLevel)}${propertyName}${optionalFlag}: ${typeExpression}`
    ];
  });
}

/**
 * 将 Widget 对象 schema 字段转换为 TypeScript 对象类型表达式。
 * @param properties - schema 字段集合
 * @param requiredFields - 必填字段列表
 * @param indentLevel - 当前缩进层级
 * @param readTypeExpression - 字段类型表达式读取函数
 * @returns TypeScript 对象类型表达式
 */
function createWidgetSchemaObjectTypeExpression(
  properties: Record<string, WidgetSchemaProperty>,
  requiredFields: string[],
  indentLevel: number,
  readTypeExpression: WidgetSchemaPropertyTypeExpressionReader
): string {
  return [
    '{',
    ...createWidgetSchemaPropertyLines(properties, requiredFields, indentLevel + 1, readTypeExpression),
    `${createTypeScriptIndent(indentLevel)}}`
  ].join('\n');
}

/**
 * 将 Widget schema 字段转换为 TypeScript 类型表达式。
 * @param property - schema 字段
 * @param indentLevel - 当前缩进层级
 * @returns TypeScript 类型表达式
 */
function createWidgetSchemaPropertyTypeExpression(property: WidgetSchemaProperty, indentLevel: number): string {
  if (property.type === 'string') {
    return 'string';
  }

  if (property.type === 'number') {
    return 'number';
  }

  if (property.type === 'boolean') {
    return 'boolean';
  }

  if (property.type === 'array') {
    return `Array<${property.items ? createWidgetSchemaPropertyTypeExpression(property.items, indentLevel) : 'unknown'}>`;
  }

  if (!property.properties || Object.keys(property.properties).length === 0) {
    return 'Record<string, unknown>';
  }

  return createWidgetSchemaObjectTypeExpression(property.properties, property.required ?? [], indentLevel, createWidgetSchemaPropertyTypeExpression);
}

/**
 * 根据 Widget schema 生成 TypeScript 接口声明。
 * @param interfaceName - 接口名称
 * @param schema - Widget schema
 * @returns TypeScript 接口声明
 */
function createWidgetSchemaInterfaceDeclaration(interfaceName: string, schema: WidgetSchemaObject): string {
  const propertyLines = createWidgetSchemaPropertyLines(schema.properties, schema.required ?? [], 1, createWidgetSchemaPropertyTypeExpression);

  return [
    ...createWidgetSchemaInterfaceDocLines(schema),
    `declare interface ${interfaceName} {`,
    ...(propertyLines.length > 0 ? propertyLines : ['  [key: string]: unknown']),
    '}'
  ].join('\n');
}

/**
 * 创建 Widget 交互脚本编辑器类型提示内容。
 * @param inputSchema - 入参 schema
 * @param stateSchema - 状态 schema
 * @returns Monaco extra lib 内容
 */
function createWidgetMethodScriptExtraLibContent(inputSchema: WidgetSchemaObject, stateSchema: WidgetSchemaObject): string {
  return `
${createWidgetSchemaInterfaceDeclaration('WidgetInput', inputSchema)}
${createWidgetSchemaInterfaceDeclaration('WidgetState', stateSchema)}

declare interface WidgetSendMessageContentPart {
  /** 消息片段类型。 */
  type: 'text'
  /** 文本内容。 */
  text: string
}

declare interface WidgetSendMessagePayload {
  /** 上行消息内容，支持纯文本或文本片段数组。 */
  content: string | WidgetSendMessageContentPart[]
  /** 是否为错误消息，默认 false。 */
  isError?: boolean
}

declare type WidgetSendMessageInput = string | WidgetSendMessageContentPart[] | WidgetSendMessagePayload

declare interface WidgetThisContext {
  /**
   * 调用小组件时 AI 提取到的入参。
   * @example const city = this.$input.city
   */
  $input: WidgetInput
  /**
   * 当前小组件运行态数据，可通过 $setState 更新。
   * @example const weather = this.$state.weather
   */
  $state: WidgetState
  /**
   * 触发当前执行的事件信息。
   * @example const event = this.$event
   */
  $event?: unknown
  /**
   * 写入小组件运行态数据，path 支持点路径，例如 weather.temperature。
   * @example this.$setState('weather.temperature', 28)
   */
  $setState(path: string, value: unknown): void
  /**
   * 向聊天上行一条消息。调用后表示当前小组件交互结束；未调用时继续等待用户操作。
   * @param message - 上行消息，支持字符串、文本片段数组或带 isError 的对象。
   * @example this.$sendMessage('确认下单')
   * @example this.$sendMessage({ content: [{ type: 'text', text: '确认下单' }] })
   */
  $sendMessage(message: WidgetSendMessageInput): Promise<void>
}

declare type WidgetLifecycleHook = (this: WidgetThisContext) => void | Promise<void>
declare type WidgetMethod = (this: WidgetThisContext, ...args: unknown[]) => void | Promise<void>
declare type WidgetMethodMap = Record<string, WidgetMethod>

declare interface WidgetConfig {
  /** 小组件创建或展示时执行。 */
  mounted?: WidgetLifecycleHook
  /** 小组件运行完成后执行一次。 */
  unmounted?: WidgetLifecycleHook
  /** 由元素事件触发的方法集合。 */
  methods?: WidgetMethodMap & ThisType<WidgetThisContext>
}

declare function defineConfig(config: WidgetConfig & ThisType<WidgetThisContext>): WidgetConfig
`;
}

const emit = defineEmits<{
  /** 保存交互脚本代码 */
  confirm: [code: string];
}>();
const open = defineModel<boolean>('open', { required: true });

/** 交互脚本代码草稿。 */
const methodCodeDraft = ref('');
/** Monaco 编辑器实例。 */
const methodEditorRef = ref<InstanceType<typeof BMonaco> | null>(null);

/** 当前用于类型推导的交互脚本代码，弹窗打开时优先使用编辑草稿。 */
const methodCodeForTypeHints = computed<string>((): string => (open.value ? methodCodeDraft.value : props.code));
/** 当前交互脚本草稿推导出的状态 schema。 */
const methodDraftStateSchema = computed<WidgetSchemaObject>((): WidgetSchemaObject => buildWidgetStateSchema(methodCodeForTypeHints.value, props.inputSchema));
/** Widget 交互脚本编辑器类型提示内容。 */
const widgetMethodScriptExtraLibContent = computed<string>((): string =>
  createWidgetMethodScriptExtraLibContent(props.inputSchema, methodDraftStateSchema.value)
);
/** Widget 交互脚本编辑器类型提示声明。 */
const widgetMethodScriptExtraLibs = computed<MonacoExtraLib[]>((): MonacoExtraLib[] => [
  {
    content: widgetMethodScriptExtraLibContent.value,
    filePath: 'tibis-widget-method-script.d.ts'
  }
]);
/** Widget 交互脚本编辑器只加载 ECMAScript 基础类型，不引入浏览器 DOM 全局变量。 */
const widgetMethodScriptCompilerOptions: MonacoCompilerOptions = {
  lib: ['es2020'],
  noImplicitThis: true
};

/**
 * 聚焦交互脚本编辑器。
 */
function focusMethodEditor(): void {
  if (!methodEditorRef.value || typeof methodEditorRef.value.focusEditor !== 'function') {
    return;
  }

  methodEditorRef.value.focusEditor();
}

/**
 * 使用当前交互脚本代码重置编辑草稿。
 * @returns 异步完成信号
 */
async function resetMethodDraft(): Promise<void> {
  methodCodeDraft.value = props.code;

  await nextTick();
  focusMethodEditor();
}

/**
 * 关闭交互脚本编辑弹窗。
 */
function handleEditorCancel(): void {
  open.value = false;
}

/**
 * 保存交互脚本代码。
 */
function handleEditorConfirm(): void {
  emit('confirm', methodCodeDraft.value);
  open.value = false;
}

watch(open, async (isOpen: boolean): Promise<void> => {
  if (!isOpen) {
    return;
  }

  await resetMethodDraft();
});

watch(
  (): string => props.code,
  async (): Promise<void> => {
    if (!open.value) {
      return;
    }

    await resetMethodDraft();
  }
);

/** 交互脚本编辑器状态。 */
const methodEditorState = computed<EditorState>(() => ({
  id: 'widget-method-script',
  name: 'widget-method.ts',
  path: null,
  ext: 'ts',
  content: methodCodeDraft.value
}));
</script>

<style lang="less" scoped>
.method-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.method-editor__host {
  position: relative;
  min-height: 420px;
  padding: 1px;
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 6px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.method-editor__host:hover {
  border-color: var(--border-hover);
}

.method-editor__host:focus-within {
  border-color: var(--input-focus-border);
  box-shadow: 0 0 0 2px var(--input-focus-shadow);
}

.method-editor__host :deep(.b-editor-monaco),
.method-editor__host :deep(.b-editor-monaco__host),
.method-editor__host :deep(.b-editor-monaco__fallback) {
  min-height: 420px;
}

.method-editor__host :deep(.monaco-editor),
.method-editor__host :deep(.monaco-editor-background) {
  background: var(--input-bg);
}

.method-editor__host :deep(.monaco-editor .margin),
.method-editor__host :deep(.monaco-editor .monaco-editor-background) {
  background: var(--input-bg);
}

.method-editor__host :deep(.monaco-editor .view-lines) {
  font-family: var(--font-family-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace);
}
</style>
