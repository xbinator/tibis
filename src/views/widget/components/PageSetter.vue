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
        <BSectionItem label="描述" direction="vertical">
          <ATextarea v-model:value="widgetDescription" :auto-size="{ minRows: 3, maxRows: 6 }" placeholder="简要说明当前小组件的能力和用途" />
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

      <BSectionBlock title="出参">
        <template #help>
          <BIcon
            class="schema-help-icon"
            icon="lucide:circle-alert"
            role="button"
            :size="14"
            tabindex="0"
            @click="openSchemaHelp('output')"
            @keydown.enter="openSchemaHelp('output')"
            @keydown.space.prevent="openSchemaHelp('output')"
          />
        </template>
        <template #extra>
          <BButton icon="lucide:plus" size="mini" square tooltip="添加字段" type="secondary" @click="addRootSchemaField('output')" />
          <BButton size="mini" type="secondary" @click="openSchemaInputEditor('output')">编辑</BButton>
        </template>
        <div class="schema-body">
          <SchemaTreeEditor v-model:schema="outputSchema" />
        </div>
      </BSectionBlock>

      <BSectionBlock title="执行方法">
        <template #extra>
          <BButton icon="lucide:code-xml" size="mini" type="secondary" @click="openMethodEditor">编辑</BButton>
        </template>
        <div class="method-summary">
          <p class="method-summary__text">触发这个小组件时，会执行这里配置的方法，用于读取入参、更新状态并返回结果。</p>
        </div>
      </BSectionBlock>

      <BSectionBlock title="动态预览">
        <BSectionItem label="input" direction="vertical">
          <ATextarea
            v-model:value="previewInputText"
            :auto-size="{ minRows: 3, maxRows: 8 }"
            :status="previewInputError ? 'error' : undefined"
            @blur="applyPreviewInputText"
          />
          <p v-if="previewInputError" class="preview-context-error">{{ previewInputError }}</p>
        </BSectionItem>
        <BSectionItem label="state" direction="vertical">
          <ATextarea
            v-model:value="previewStateText"
            :auto-size="{ minRows: 3, maxRows: 8 }"
            :status="previewStateError ? 'error' : undefined"
            @blur="applyPreviewStateText"
          />
          <p v-if="previewStateError" class="preview-context-error">{{ previewStateError }}</p>
        </BSectionItem>
      </BSectionBlock>
    </ATabPane>
  </ATabs>

  <SchemaInputEditor v-model:open="schemaInputEditorOpen" :kind="activeSchemaKind" :schema="activeSchema" @confirm="handleSchemaInputEditorConfirm" />
  <MethodEditor v-model:open="methodEditorOpen" :code="mainMethodCode" @confirm="handleMethodEditorConfirm" />
  <SchemaHelp v-model:open="schemaHelpDrawerOpen" :kind="activeSchemaHelpKind" />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { cloneDeep, has, isBoolean, isFinite, isPlainObject, isString } from 'lodash-es';
import type { WidgetData, WidgetRenderContext, WidgetSchemaObject, WidgetSchemaProperty, WidgetSkillMethod } from '@/components/BWidget/types';
import type { WidgetSchemaKind } from '@/components/BWidget/utils/widgetData';
import { readWidgetPreviewRenderContext, writeWidgetPreviewRenderContext } from '@/components/BWidget/utils/widgetPreviewContext';
import MethodEditor from './PageSetter/MethodEditor.vue';
import SchemaHelp from './PageSetter/SchemaHelp.vue';
import SchemaInputEditor from './PageSetter/SchemaInputEditor.vue';
import SchemaTreeEditor from './PageSetter/SchemaTreeEditor.vue';

/**
 * 预览上下文 JSON 解析成功结果。
 */
interface PreviewContextParseSuccess {
  /** 解析是否成功 */
  ok: true;
  /** 解析后的对象值 */
  value: Record<string, unknown>;
}

/**
 * 预览上下文 JSON 解析失败结果。
 */
interface PreviewContextParseFailure {
  /** 解析是否成功 */
  ok: false;
  /** 错误提示 */
  message: string;
}

/** 预览上下文 JSON 解析结果。 */
type PreviewContextParseResult = PreviewContextParseSuccess | PreviewContextParseFailure;

/** Widget Skill 默认入口方法名称。 */
const WIDGET_SKILL_EXECUTE_METHOD_NAME = 'execute';
/** Widget Skill 默认方法超时时间。 */
const WIDGET_SKILL_DEFAULT_METHOD_TIMEOUT = 10000;
/** Schema 默认新增字段名。 */
const DEFAULT_SCHEMA_FIELD_NAME = 'field';
/** Widget Skill 默认方法代码。 */
const WIDGET_SKILL_DEFAULT_METHOD_CODE = [
  '// 在这里，您可以通过 ctx.input 获取小组件输入变量，并通过 ctx.result 输出执行结果。',
  '// ctx 已经被正确注入到执行环境中，无需自行创建。',
  '// 下面是一个示例，获取小组件输入中字段名为 city 的值：',
  '// const city = ctx.input.city',
  '// 下面是一个示例，输出当前 city 和执行完成消息：',
  "// return ctx.result.success({ city: ctx.input.city, message: '执行完成' })",
  '',
  'export async function execute(ctx: WidgetSkillContext): Promise<ExecutionResult> {',
  '  const { input, state, setState, result } = ctx',
  '  const city = input.city',
  '',
  "  setState('lastQuery', {",
  '    city,',
  '    stateSnapshot: state',
  '  })',
  '',
  '  return result.success({',
  '    city,',
  "    message: '执行完成'",
  '  })',
  '}',
  ''
].join('\n');

const dataItem = defineModel<WidgetData>('value', { required: true });

/** Schema JSON 编辑弹窗开关状态。 */
const schemaInputEditorOpen = ref(false);
/** 执行方法编辑弹窗开关。 */
const methodEditorOpen = ref(false);
/** 当前编辑的 schema 类型。 */
const activeSchemaKind = ref<WidgetSchemaKind>('input');
/** Schema 填写说明抽屉开关。 */
const schemaHelpDrawerOpen = ref(false);
/** 当前说明抽屉对应的 schema 类型。 */
const activeSchemaHelpKind = ref<WidgetSchemaKind>('input');
/** 预览 input JSON 文本。 */
const previewInputText = ref<string>('{}');
/** 预览 state JSON 文本。 */
const previewStateText = ref<string>('{}');
/** 预览 input JSON 错误提示。 */
const previewInputError = ref<string>('');
/** 预览 state JSON 错误提示。 */
const previewStateError = ref<string>('');

/**
 * 向当前 Widget 数据写入配置变更。
 * @param patch - Widget 配置增量
 */
function updateWidgetDataConfig(patch: Partial<Pick<WidgetData, 'description' | 'inputSchema' | 'name' | 'outputSchema'>>): void {
  dataItem.value = { ...dataItem.value, ...patch };
}

/**
 * 判断值是否为普通对象记录。
 * @param value - 待判断值
 * @returns 是否为普通对象记录
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value);
}

/**
 * 创建默认 Widget Skill 方法。
 * @returns 默认方法定义
 */
function createDefaultWidgetSkillMethod(): WidgetSkillMethod {
  return {
    enabled: true,
    description: '',
    timeout: WIDGET_SKILL_DEFAULT_METHOD_TIMEOUT,
    code: WIDGET_SKILL_DEFAULT_METHOD_CODE
  };
}

/**
 * 从未知值读取 Widget Skill 方法。
 * @param value - 原始方法值
 * @returns 标准方法定义
 */
function readWidgetSkillMethod(value: unknown): WidgetSkillMethod {
  if (!isRecord(value)) {
    return createDefaultWidgetSkillMethod();
  }

  return {
    enabled: isBoolean(value.enabled) ? value.enabled : true,
    description: isString(value.description) ? value.description : '',
    timeout: isFinite(value.timeout) ? (value.timeout as number) : WIDGET_SKILL_DEFAULT_METHOD_TIMEOUT,
    code: isString(value.code) && value.code.trim().length > 0 ? value.code : WIDGET_SKILL_DEFAULT_METHOD_CODE
  };
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
  if (!has(schema.properties, DEFAULT_SCHEMA_FIELD_NAME)) {
    return DEFAULT_SCHEMA_FIELD_NAME;
  }

  let index = 1;
  while (has(schema.properties, `${DEFAULT_SCHEMA_FIELD_NAME}${index}`)) {
    index += 1;
  }

  return `${DEFAULT_SCHEMA_FIELD_NAME}${index}`;
}

/**
 * 添加根级 schema 字段。
 * @param kind - schema 类型
 */
function addRootSchemaField(kind: WidgetSchemaKind): void {
  const nextSchema = cloneDeep(kind === 'input' ? dataItem.value.inputSchema : dataItem.value.outputSchema);
  const fieldName = createUniqueRootSchemaFieldName(nextSchema);

  nextSchema.properties[fieldName] = createDefaultSchemaField();

  if (kind === 'input') {
    updateWidgetDataConfig({ inputSchema: nextSchema });
    return;
  }

  updateWidgetDataConfig({ outputSchema: nextSchema });
}

/**
 * 读取当前 Skill metadata 记录。
 * @returns Skill metadata 记录
 */
function readSkillMetadataRecord(): Record<string, unknown> {
  const { skill } = dataItem.value.metadata;

  return isRecord(skill) ? skill : {};
}

/**
 * 读取当前 Skill 方法记录。
 * @returns Skill 方法记录
 */
function readSkillMethodsRecord(): Record<string, unknown> {
  const { methods } = readSkillMetadataRecord();

  return isRecord(methods) ? methods : {};
}

/**
 * 读取当前 execute 方法。
 * @returns execute 方法定义
 */
function readMainMethod(): WidgetSkillMethod {
  return readWidgetSkillMethod(readSkillMethodsRecord()[WIDGET_SKILL_EXECUTE_METHOD_NAME]);
}

/**
 * 写入当前 execute 方法。
 * @param method - execute 方法定义
 */
function writeMainMethod(method: WidgetSkillMethod): void {
  const skill = readSkillMetadataRecord();
  const methods = readSkillMethodsRecord();

  dataItem.value = {
    ...dataItem.value,
    metadata: {
      ...dataItem.value.metadata,
      skill: {
        ...skill,
        methods: {
          ...methods,
          [WIDGET_SKILL_EXECUTE_METHOD_NAME]: method
        }
      }
    }
  };
}

/**
 * 格式化预览上下文对象为 JSON 文本。
 * @param value - 预览上下文对象
 * @returns JSON 文本
 */
function formatPreviewContextText(value: Record<string, unknown>): string {
  return JSON.stringify(value, null, 2);
}

/**
 * 从当前 Widget 读取预览上下文。
 * @returns 预览渲染上下文
 */
function readCurrentPreviewContext(): WidgetRenderContext {
  return (
    readWidgetPreviewRenderContext(dataItem.value.metadata) ?? {
      input: {},
      state: {}
    }
  );
}

/**
 * 同步预览上下文编辑器文本。
 */
function syncPreviewContextText(): void {
  const previewContext = readCurrentPreviewContext();

  previewInputText.value = formatPreviewContextText(previewContext.input);
  previewStateText.value = formatPreviewContextText(previewContext.state);
  previewInputError.value = '';
  previewStateError.value = '';
}

/**
 * 解析预览上下文 JSON 文本。
 * @param text - JSON 文本
 * @param label - 上下文根名称
 * @returns 解析结果
 */
function parsePreviewContextText(text: string, label: 'input' | 'state'): PreviewContextParseResult {
  const normalizedText = text.trim();

  if (normalizedText.length === 0) {
    return {
      ok: true,
      value: {}
    };
  }

  try {
    const value = JSON.parse(normalizedText) as unknown;

    if (!isPlainObject(value)) {
      return {
        ok: false,
        message: `${label} 必须是 JSON 对象`
      };
    }

    return {
      ok: true,
      value: value as Record<string, unknown>
    };
  } catch (_error: unknown) {
    return {
      ok: false,
      message: `${label} 必须是合法 JSON`
    };
  }
}

/**
 * 更新预览上下文。
 * @param patch - 预览上下文增量
 */
function updatePreviewContext(patch: Partial<Pick<WidgetRenderContext, 'input' | 'state'>>): void {
  const previewContext = {
    ...readCurrentPreviewContext(),
    ...patch
  };

  dataItem.value = {
    ...dataItem.value,
    metadata: writeWidgetPreviewRenderContext(dataItem.value.metadata, previewContext)
  };
}

/**
 * 保存预览 input JSON。
 */
function applyPreviewInputText(): void {
  const result = parsePreviewContextText(previewInputText.value, 'input');

  if (!result.ok) {
    previewInputError.value = result.message;
    return;
  }

  previewInputError.value = '';
  updatePreviewContext({ input: result.value });
}

/**
 * 保存预览 state JSON。
 */
function applyPreviewStateText(): void {
  const result = parsePreviewContextText(previewStateText.value, 'state');

  if (!result.ok) {
    previewStateError.value = result.message;
    return;
  }

  previewStateError.value = '';
  updatePreviewContext({ state: result.value });
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

/** 当前 Widget 能力描述。 */
const widgetDescription = computed<string>({
  /**
   * 读取 Widget 能力描述。
   * @returns 功能描述
   */
  get: (): string => dataItem.value.description,
  /**
   * 写入 Widget 能力描述。
   * @param value - 新功能描述
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

/** 出参 schema。 */
const outputSchema = computed<WidgetSchemaObject>({
  /**
   * 读取出参 schema。
   * @returns 出参 schema
   */
  get: (): WidgetSchemaObject => dataItem.value.outputSchema,
  /**
   * 写入出参 schema。
   * @param value - 新出参 schema
   */
  set: (value: WidgetSchemaObject): void => {
    updateWidgetDataConfig({ outputSchema: value });
  }
});

/** 当前 execute 方法。 */
const mainMethod = computed<WidgetSkillMethod>({
  /**
   * 读取 execute 方法。
   * @returns execute 方法定义
   */
  get: (): WidgetSkillMethod => readMainMethod(),
  /**
   * 写入 execute 方法。
   * @param value - execute 方法定义
   */
  set: (value: WidgetSkillMethod): void => {
    writeMainMethod(value);
  }
});

/** 当前 execute 方法代码。 */
const mainMethodCode = computed<string>({
  /**
   * 读取 execute 方法代码。
   * @returns execute 方法代码
   */
  get: (): string => mainMethod.value.code,
  /**
   * 写入 execute 方法代码。
   * @param value - execute 方法代码
   */
  set: (value: string): void => {
    mainMethod.value = {
      ...mainMethod.value,
      code: value
    };
  }
});

/**
 * 打开 Schema JSON 编辑弹窗。
 * @param kind - schema 类型
 */
function openSchemaInputEditor(kind: WidgetSchemaKind): void {
  activeSchemaKind.value = kind;
  schemaInputEditorOpen.value = true;
}

/**
 * 打开执行方法编辑弹窗。
 */
function openMethodEditor(): void {
  methodEditorOpen.value = true;
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
  if (activeSchemaKind.value === 'input') {
    updateWidgetDataConfig({ inputSchema: schema });
    return;
  }

  updateWidgetDataConfig({ outputSchema: schema });
}

/**
 * 保存执行方法代码。
 * @param code - execute 方法代码
 */
function handleMethodEditorConfirm(code: string): void {
  mainMethodCode.value = code;
}

/** 当前正在编辑的 Schema。 */
const activeSchema = computed<WidgetSchemaObject>(() => (activeSchemaKind.value === 'input' ? dataItem.value.inputSchema : dataItem.value.outputSchema));

watch(() => dataItem.value.metadata, syncPreviewContextText, { deep: true, immediate: true });
</script>

<style lang="less" scoped>
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

.preview-context-error {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-danger);
}

.method-summary {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
}

.method-summary__text {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-secondary);
}
</style>
