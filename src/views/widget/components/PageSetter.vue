<!--
  @file PageSetter.vue
  @description Widget页面默认Widget设置面板。
-->
<template>
  <ATabs class="page-setter">
    <ATabPane key="basic" tab="设计">
      <BSectionBlock title="基础">
        <BSectionItem label="名称">
          <AInput v-model:value="widgetName" placeholder="小组件名称" />
        </BSectionItem>
        <BSectionItem label="AI 使用说明" direction="vertical">
          <ATextarea
            v-model:value="widgetDescription"
            :auto-size="{ minRows: 3, maxRows: 6 }"
            placeholder="描述这个小组件能做什么、适合什么场景，帮助 AI 判断何时展示"
          />
        </BSectionItem>
      </BSectionBlock>

      <BSectionBlock title="入参">
        <template #help>
          <BIcon
            class="schema-help-icon"
            icon="lucide:circle-alert"
            role="button"
            :size="14"
            tabindex="0"
            @click="openSchemaHelp('input')"
            @keydown.enter="openSchemaHelp('input')"
            @keydown.space.prevent="openSchemaHelp('input')"
          />
        </template>
        <template #extra>
          <BButton icon="lucide:plus" size="mini" square tooltip="添加字段" type="secondary" @click="addRootSchemaField('input')" />
          <BButton size="mini" type="secondary" @click="openSchemaInputEditor('input')">编辑</BButton>
        </template>
        <div class="schema-body">
          <SchemaTreeEditor v-model:schema="inputSchema" />
        </div>
      </BSectionBlock>

      <BSectionBlock title="运行代码">
        <template #extra>
          <BButton icon="lucide:code-xml" size="mini" type="secondary" @click="emitEditCode">编辑</BButton>
        </template>
        <div class="method-summary">
          <pre class="method-summary__code"><code class="method-summary__code-content"><span
            v-for="line in highlightedMethodPreviewLines"
            :key="line.index"
            class="method-summary__line"
          ><span
            v-for="(token, tokenIndex) in line.tokens"
            :key="tokenIndex"
            :class="token.className"
          >{{ token.text }}</span></span></code></pre>
        </div>
      </BSectionBlock>
    </ATabPane>
  </ATabs>
  <!-- Schema JSON 编辑弹窗 -->
  <SchemaInputEditor v-model:open="schemaInputEditorOpen" :kind="activeSchemaKind" :schema="activeSchema" @confirm="handleSchemaInputEditorConfirm" />
  <!-- Schema 填写说明抽屉 -->
  <SchemaHelp v-model:open="schemaHelpDrawerOpen" :kind="activeSchemaHelpKind" />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { castArray, cloneDeep, flatten, has, isString, split } from 'lodash-es';
import { common, createLowlight } from 'lowlight';
import type { WidgetData, WidgetExecuteMethod, WidgetSchemaObject, WidgetSchemaProperty } from '@/components/BWidget/types';
import type { WidgetSchemaKind } from '@/components/BWidget/utils/widgetData';
import { WIDGET_INTERACTION_SCRIPT_HIGHLIGHT_LANGUAGE, WIDGET_SCHEMA_DEFAULT_FIELD_NAME } from '../constants/pageSetter';
import { readWidgetExecuteMethod } from '../utils/widgetExecuteMethod';
import SchemaHelp from './PageSetter/SchemaHelp.vue';
import SchemaInputEditor from './PageSetter/SchemaInputEditor.vue';
import SchemaTreeEditor from './PageSetter/SchemaTreeEditor.vue';

/** JS 脚本摘要 Lowlight 实例。 */
const methodSummaryLowlight = createLowlight(common);

const dataItem = defineModel<WidgetData>('value', { required: true });
const emit = defineEmits<{
  /** 打开 Widget JS 脚本代码编辑器 */
  'edit-code': [];
}>();

/** Schema JSON 编辑弹窗开关状态。 */
const schemaInputEditorOpen = ref(false);
/** 当前编辑的 schema 类型。 */
const activeSchemaKind = ref<WidgetSchemaKind>('input');
/** Schema 填写说明抽屉开关。 */
const schemaHelpDrawerOpen = ref(false);
/** 当前说明抽屉对应的 schema 类型。 */
const activeSchemaHelpKind = ref<WidgetSchemaKind>('input');
/**
 * 向当前 Widget 数据写入配置变更。
 * @param patch - Widget 配置增量
 */
function updateWidgetDataConfig(patch: Partial<Pick<WidgetData, 'description' | 'inputSchema' | 'dataSchema' | 'name'>>): void {
  dataItem.value = { ...dataItem.value, ...patch };
}

/**
 * 创建默认 schema 字段。
 * @returns 默认 schema 字段
 */
function createDefaultSchemaField(): WidgetSchemaProperty {
  return { type: 'string' };
}

/**
 * 创建根级唯一 schema 字段名。
 * @param schema - schema 对象
 * @returns 唯一字段名
 */
function createUniqueRootSchemaFieldName(schema: WidgetSchemaObject): string {
  if (!has(schema.properties, WIDGET_SCHEMA_DEFAULT_FIELD_NAME)) {
    return WIDGET_SCHEMA_DEFAULT_FIELD_NAME;
  }

  let index = 1;
  while (has(schema.properties, `${WIDGET_SCHEMA_DEFAULT_FIELD_NAME}${index}`)) {
    index += 1;
  }

  return `${WIDGET_SCHEMA_DEFAULT_FIELD_NAME}${index}`;
}

/**
 * 按类型读取 Widget schema。
 * @param kind - schema 类型
 * @returns 对应 schema
 */
function readWidgetSchema(kind: WidgetSchemaKind): WidgetSchemaObject {
  if (kind === 'input') {
    return dataItem.value.inputSchema;
  }

  if (kind === 'data') {
    return dataItem.value.dataSchema;
  }

  return dataItem.value.dataSchema;
}

/**
 * 按类型写入 Widget schema。
 * @param kind - schema 类型
 * @param schema - 新 schema
 */
function updateWidgetSchema(kind: WidgetSchemaKind, schema: WidgetSchemaObject): void {
  if (kind === 'input') {
    updateWidgetDataConfig({ inputSchema: schema });
    return;
  }

  if (kind === 'data') {
    updateWidgetDataConfig({ dataSchema: schema });
    return;
  }

  updateWidgetDataConfig({ dataSchema: schema });
}

/**
 * 添加根级 schema 字段。
 * @param kind - schema 类型
 */
function addRootSchemaField(kind: WidgetSchemaKind): void {
  const nextSchema = cloneDeep(readWidgetSchema(kind));
  const fieldName = createUniqueRootSchemaFieldName(nextSchema);

  nextSchema.properties[fieldName] = createDefaultSchemaField();

  updateWidgetSchema(kind, nextSchema);
}

/**
 * 读取当前JS 脚本配置。
 * @returns JS 脚本配置
 */
function readMethodScript(): WidgetExecuteMethod {
  return readWidgetExecuteMethod(dataItem.value.execute);
}

/** 当前 Widget 能力名称。 */
const widgetName = computed<string>({
  /**
   * 读取 Widget 能力名称。
   * @returns 能力名称
   */
  get: (): string => dataItem.value.name,
  /**
   * 写入 Widget 能力名称。
   * @param value - 新能力名称
   */
  set: (value: string): void => {
    updateWidgetDataConfig({ name: value });
  }
});

/** 当前 Widget AI 使用说明。 */
const widgetDescription = computed<string>({
  /**
   * 读取 Widget AI 使用说明。
   * @returns AI 使用说明
   */
  get: (): string => dataItem.value.description,
  /**
   * 写入 Widget AI 使用说明。
   * @param value - 新 AI 使用说明
   */
  set: (value: string): void => {
    updateWidgetDataConfig({ description: value });
  }
});

/** 入参 schema。 */
const inputSchema = computed<WidgetSchemaObject>({
  /**
   * 读取入参 schema。
   * @returns 入参 schema
   */
  get: (): WidgetSchemaObject => dataItem.value.inputSchema,
  /**
   * 写入入参 schema。
   * @param value - 新入参 schema
   */
  set: (value: WidgetSchemaObject): void => {
    updateWidgetDataConfig({ inputSchema: value });
  }
});

/** 当前JS 脚本配置。 */
const interactionScript = computed<WidgetExecuteMethod>((): WidgetExecuteMethod => readMethodScript());

/** 当前JS 脚本代码。 */
const interactionScriptCode = computed<string>((): string => interactionScript.value.code);

/**
 * Lowlight 文本节点。
 */
interface LowlightTextNode {
  /** 节点类型 */
  type: 'text';
  /** 文本内容 */
  value: string;
}

/**
 * Lowlight 元素节点。
 */
interface LowlightElementNode {
  /** 节点类型 */
  type: 'element' | 'root';
  /** 子节点 */
  children?: Array<LowlightElementNode | LowlightTextNode>;
  /** 节点属性 */
  properties?: {
    /** CSS 类名 */
    className?: string[] | string;
  };
}

/**
 * Lowlight 节点。
 */
type LowlightNode = LowlightElementNode | LowlightTextNode;

/**
 * JS 脚本代码摘要 token。
 */
interface MethodSummaryToken {
  /** token 文本 */
  text: string;
  /** 安全 CSS 类名 */
  className?: string;
}

/**
 * JS 脚本代码摘要行。
 */
interface MethodSummaryLine {
  /** 行索引 */
  index: number;
  /** 行内 token */
  tokens: MethodSummaryToken[];
}

/**
 * 将纯文本转为摘要 token。
 * @param text - 代码文本
 * @returns 摘要 token
 */
function textToMethodSummaryTokens(text: string): MethodSummaryToken[] {
  return text ? [{ text }] : [];
}

/**
 * 读取 Lowlight 元素节点的安全类名。
 * @param node - Lowlight 元素节点
 * @returns 安全类名
 */
function getLowlightClassNames(node: LowlightElementNode): string[] {
  const rawClassName = node.properties?.className;
  const classNameItems = rawClassName ? castArray(rawClassName) : [];
  const classNames = flatten(classNameItems.map((item: string | string[]): string[] => (isString(item) ? split(item, /\s+/u) : item)));

  return classNames.filter((className: string): boolean => className.startsWith('hljs-'));
}

/**
 * 将 Lowlight 节点拍平成摘要 token。
 * @param node - Lowlight 节点
 * @param activeClassNames - 父级继承的高亮类名
 * @returns 摘要 token
 */
function lowlightNodeToMethodSummaryTokens(node: LowlightNode, activeClassNames: readonly string[] = []): MethodSummaryToken[] {
  if (node.type === 'text') {
    if (!node.value) {
      return [];
    }

    const className = activeClassNames.join(' ');

    return [{ text: node.value, className: className || undefined }];
  }

  const mergedClassNames = [...new Set([...activeClassNames, ...getLowlightClassNames(node)])];

  return node.children?.flatMap((child: LowlightNode): MethodSummaryToken[] => lowlightNodeToMethodSummaryTokens(child, mergedClassNames)) ?? [];
}

/**
 * 高亮JS 脚本代码。
 * @param code - JS 脚本代码
 * @returns 高亮 token
 */
function highlightMethodCode(code: string): MethodSummaryToken[] {
  if (!methodSummaryLowlight.registered(WIDGET_INTERACTION_SCRIPT_HIGHLIGHT_LANGUAGE)) {
    return textToMethodSummaryTokens(code);
  }

  try {
    const tree = methodSummaryLowlight.highlight(WIDGET_INTERACTION_SCRIPT_HIGHLIGHT_LANGUAGE, code) as LowlightNode;

    return lowlightNodeToMethodSummaryTokens(tree);
  } catch {
    return textToMethodSummaryTokens(code);
  }
}

/**
 * 将高亮 token 按真实换行拆成预览行。
 * @param tokens - 高亮 token
 * @returns 预览行列表
 */
function splitMethodSummaryTokensIntoLines(tokens: MethodSummaryToken[]): MethodSummaryLine[] {
  const lines: MethodSummaryLine[] = [{ index: 0, tokens: [] }];

  tokens.forEach((token: MethodSummaryToken): void => {
    const parts = token.text.split('\n');

    parts.forEach((part: string, partIndex: number): void => {
      if (part) {
        lines[lines.length - 1].tokens.push({ ...token, text: part });
      }

      if (partIndex < parts.length - 1) {
        lines.push({ index: lines.length, tokens: [] });
      }
    });
  });

  return lines;
}

/** 高亮后的JS 脚本摘要代码行。 */
const highlightedMethodPreviewLines = computed<MethodSummaryLine[]>(() => splitMethodSummaryTokensIntoLines(highlightMethodCode(interactionScriptCode.value)));

/**
 * 打开 Schema JSON 编辑弹窗。
 * @param kind - schema 类型
 */
function openSchemaInputEditor(kind: WidgetSchemaKind): void {
  activeSchemaKind.value = kind;
  schemaInputEditorOpen.value = true;
}

/**
 * 触发打开JS 脚本代码编辑器。
 */
function emitEditCode(): void {
  emit('edit-code');
}

/**
 * 打开 Schema 填写说明抽屉。
 * @param kind - schema 类型
 */
function openSchemaHelp(kind: WidgetSchemaKind): void {
  activeSchemaHelpKind.value = kind;
  schemaHelpDrawerOpen.value = true;
}

/**
 * 保存指定类型的 Schema。
 * @param schema - 标准化后的 schema
 */
function handleSchemaInputEditorConfirm(schema: WidgetSchemaObject): void {
  updateWidgetSchema(activeSchemaKind.value, schema);
}

/** 当前正在编辑的 Schema。 */
const activeSchema = computed<WidgetSchemaObject>(() => readWidgetSchema(activeSchemaKind.value));
</script>

<style lang="less" scoped>
@import url('@/assets/styles/markdown.less');

.page-setter {
  width: 100%;
}

.schema-help-icon {
  color: var(--text-tertiary);
  cursor: pointer;
  transition: color 0.15s ease;
}

.schema-help-icon:hover,
.schema-help-icon:focus {
  color: var(--color-primary);
}

.schema-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.method-summary {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
}

.method-summary__code {
  --code-text: #24292f;
  --code-keyword: #cf222e;
  --code-string: #0a3069;
  --code-number: #0550ae;
  --code-comment: #6e7781;
  --code-function: #8250df;
  --code-variable: #953800;
  --code-tag: #116329;
  --code-attr-name: #953800;
  --code-attr-value: #0a3069;
  --code-builtin: #0550ae;
  --code-class: #953800;
  --code-constant: #0550ae;

  max-height: 220px;
  padding: 8px 10px;
  margin: 0;
  overflow: auto;
  font-family: var(--font-family-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace);
  font-size: 12px;
  line-height: 1.7;
  color: var(--code-text);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  background: var(--bg-primary);
  border: 1px solid var(--border-secondary);
  border-radius: 4px;
  .code-highlight();
}

.method-summary__line {
  display: block;
  min-height: 1.7em;
}
</style>
