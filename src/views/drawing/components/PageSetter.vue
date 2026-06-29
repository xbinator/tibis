<!--
  @file PageSetter.vue
  @description 画图页面默认画布设置面板。
-->
<template>
  <ATabs class="page-setter">
    <ATabPane key="basic" tab="设计">
      <BSectionBlock title="基础">
        <BSectionItem label="名称">
          <AInput v-model:value="drawingName" placeholder="组件名称" />
        </BSectionItem>
        <BSectionItem label="描述" direction="vertical">
          <ATextarea v-model:value="drawingDescription" :auto-size="{ minRows: 3, maxRows: 6 }" placeholder="简要说明当前组件的能力和用途" />
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
          <BButton size="mini" type="secondary" @click="openSchemaEditor('input')">编辑</BButton>
        </template>
        <div class="schema-body">
          <pre class="schema-preview">{{ inputSchemaPreview }}</pre>
        </div>
      </BSectionBlock>

      <BSectionBlock title="执行方法">
        <template #extra>
          <BButton size="mini" type="secondary" @click="openMethodEditor">编辑</BButton>
        </template>
        <div class="method-summary">
          <p class="method-summary__text">触发这个画布时，会执行这里配置的方法，用于读取入参、更新画布状态并返回结果。</p>
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
          <BButton size="mini" type="secondary" @click="openSchemaEditor('output')">编辑</BButton>
        </template>
        <div class="schema-body">
          <pre class="schema-preview">{{ outputSchemaPreview }}</pre>
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

  <SchemaEditor v-model:open="schemaEditorOpen" :kind="activeSchemaKind" :schema="activeSchema" @confirm="handleSchemaEditorConfirm" />
  <MethodEditor v-model:open="methodEditorOpen" :code="mainMethodCode" @confirm="handleMethodEditorConfirm" />
  <SchemaHelp v-model:open="schemaHelpDrawerOpen" :kind="activeSchemaHelpKind" />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { DrawingData, DrawingRenderContext, DrawingSchemaObject, DrawingSkillMethod } from '@/components/BDrawing/types';
import type { DrawingSchemaKind } from '@/components/BDrawing/utils/drawingData';
import { readDrawingPreviewRenderContext, writeDrawingPreviewRenderContext } from '@/components/BDrawing/utils/drawingPreviewContext';
import MethodEditor from './PageSetter/MethodEditor.vue';
import SchemaEditor from './PageSetter/SchemaEditor.vue';
import SchemaHelp from './PageSetter/SchemaHelp.vue';

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

/** Drawing Skill 默认入口方法名称。 */
const DRAWING_SKILL_EXECUTE_METHOD_NAME = 'execute';
/** Drawing Skill 默认方法超时时间。 */
const DRAWING_SKILL_DEFAULT_METHOD_TIMEOUT = 10000;
/** Drawing Skill 默认方法代码。 */
const DRAWING_SKILL_DEFAULT_METHOD_CODE = [
  'export async function execute(ctx: DrawingSkillContext): Promise<ExecutionResult> {',
  '  const { input, state, setState, result } = ctx',
  '',
  "  setState('example', {",
  '    input,',
  '    state',
  '  })',
  '',
  '  return result.success({',
  "    message: '执行完成'",
  '  })',
  '}',
  ''
].join('\n');

const drawingData = defineModel<DrawingData>('value', { required: true });

/** Schema 编辑弹窗开关状态。 */
const schemaEditorOpen = ref(false);
/** 执行方法编辑弹窗开关。 */
const methodEditorOpen = ref(false);
/** 当前编辑的 schema 类型。 */
const activeSchemaKind = ref<DrawingSchemaKind>('input');
/** Schema 填写说明抽屉开关。 */
const schemaHelpDrawerOpen = ref(false);
/** 当前说明抽屉对应的 schema 类型。 */
const activeSchemaHelpKind = ref<DrawingSchemaKind>('input');
/** 预览 input JSON 文本。 */
const previewInputText = ref<string>('{}');
/** 预览 state JSON 文本。 */
const previewStateText = ref<string>('{}');
/** 预览 input JSON 错误提示。 */
const previewInputError = ref<string>('');
/** 预览 state JSON 错误提示。 */
const previewStateError = ref<string>('');

/**
 * 向当前画图数据写入画板配置变更。
 * @param patch - 画板配置增量
 */
function updateDrawingDataConfig(patch: Partial<Pick<DrawingData, 'description' | 'inputSchema' | 'name' | 'outputSchema'>>): void {
  drawingData.value = {
    ...drawingData.value,
    ...patch
  };
}

/**
 * 判断值是否为普通对象记录。
 * @param value - 待判断值
 * @returns 是否为普通对象记录
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 创建默认 Drawing Skill 方法。
 * @returns 默认方法定义
 */
function createDefaultDrawingSkillMethod(): DrawingSkillMethod {
  return {
    enabled: true,
    description: '',
    timeout: DRAWING_SKILL_DEFAULT_METHOD_TIMEOUT,
    code: DRAWING_SKILL_DEFAULT_METHOD_CODE
  };
}

/**
 * 从未知值读取 Drawing Skill 方法。
 * @param value - 原始方法值
 * @returns 标准方法定义
 */
function readDrawingSkillMethod(value: unknown): DrawingSkillMethod {
  if (!isRecord(value)) {
    return createDefaultDrawingSkillMethod();
  }

  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : true,
    description: typeof value.description === 'string' ? value.description : '',
    timeout: typeof value.timeout === 'number' && Number.isFinite(value.timeout) ? value.timeout : DRAWING_SKILL_DEFAULT_METHOD_TIMEOUT,
    code: typeof value.code === 'string' && value.code.trim().length > 0 ? value.code : DRAWING_SKILL_DEFAULT_METHOD_CODE
  };
}

/**
 * 读取当前 Skill metadata 记录。
 * @returns Skill metadata 记录
 */
function readSkillMetadataRecord(): Record<string, unknown> {
  const { skill } = drawingData.value.metadata;

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
function readMainMethod(): DrawingSkillMethod {
  return readDrawingSkillMethod(readSkillMethodsRecord()[DRAWING_SKILL_EXECUTE_METHOD_NAME]);
}

/**
 * 写入当前 execute 方法。
 * @param method - execute 方法定义
 */
function writeMainMethod(method: DrawingSkillMethod): void {
  const skill = readSkillMetadataRecord();
  const methods = readSkillMethodsRecord();

  drawingData.value = {
    ...drawingData.value,
    metadata: {
      ...drawingData.value.metadata,
      skill: {
        ...skill,
        methods: {
          ...methods,
          [DRAWING_SKILL_EXECUTE_METHOD_NAME]: method
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
 * 从当前画布读取预览上下文。
 * @returns 预览渲染上下文
 */
function readCurrentPreviewContext(): DrawingRenderContext {
  return (
    readDrawingPreviewRenderContext(drawingData.value.metadata) ?? {
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

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
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
function updatePreviewContext(patch: Partial<Pick<DrawingRenderContext, 'input' | 'state'>>): void {
  const previewContext = {
    ...readCurrentPreviewContext(),
    ...patch
  };

  drawingData.value = {
    ...drawingData.value,
    metadata: writeDrawingPreviewRenderContext(drawingData.value.metadata, previewContext)
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

/** 当前画板能力名称。 */
const drawingName = computed<string>({
  /**
   * 读取画板能力名称。
   * @returns 能力名称
   */
  get: (): string => drawingData.value.name,
  /**
   * 写入画板能力名称。
   * @param value - 新能力名称
   */
  set: (value: string): void => {
    updateDrawingDataConfig({ name: value });
  }
});

/** 当前画板能力描述。 */
const drawingDescription = computed<string>({
  /**
   * 读取画板能力描述。
   * @returns 功能描述
   */
  get: (): string => drawingData.value.description,
  /**
   * 写入画板能力描述。
   * @param value - 新功能描述
   */
  set: (value: string): void => {
    updateDrawingDataConfig({ description: value });
  }
});

/** 当前 execute 方法。 */
const mainMethod = computed<DrawingSkillMethod>({
  /**
   * 读取 execute 方法。
   * @returns execute 方法定义
   */
  get: (): DrawingSkillMethod => readMainMethod(),
  /**
   * 写入 execute 方法。
   * @param value - execute 方法定义
   */
  set: (value: DrawingSkillMethod): void => {
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
 * 格式化 schema 为预览 JSON 文本。
 * @param schema - schema 对象
 * @returns JSON 文本
 */
function formatSchemaText(schema: DrawingSchemaObject): string {
  return JSON.stringify(schema, null, 2);
}

/**
 * 打开 Schema 编辑弹窗。
 * @param kind - schema 类型
 */
function openSchemaEditor(kind: DrawingSchemaKind): void {
  activeSchemaKind.value = kind;
  schemaEditorOpen.value = true;
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
function openSchemaHelp(kind: DrawingSchemaKind): void {
  activeSchemaHelpKind.value = kind;
  schemaHelpDrawerOpen.value = true;
}

/**
 * 保存指定类型的 Schema。
 * @param schema - 标准化后的 schema
 */
function handleSchemaEditorConfirm(schema: DrawingSchemaObject): void {
  if (activeSchemaKind.value === 'input') {
    updateDrawingDataConfig({ inputSchema: schema });
    return;
  }

  updateDrawingDataConfig({ outputSchema: schema });
}

/**
 * 保存执行方法代码。
 * @param code - execute 方法代码
 */
function handleMethodEditorConfirm(code: string): void {
  mainMethodCode.value = code;
}

/** 当前正在编辑的 Schema。 */
const activeSchema = computed<DrawingSchemaObject>(() => (activeSchemaKind.value === 'input' ? drawingData.value.inputSchema : drawingData.value.outputSchema));
/** 入参 schema 预览文本。 */
const inputSchemaPreview = computed<string>(() => formatSchemaText(drawingData.value.inputSchema));
/** 出参 schema 预览文本。 */
const outputSchemaPreview = computed<string>(() => formatSchemaText(drawingData.value.outputSchema));

watch(() => drawingData.value.metadata, syncPreviewContextText, { deep: true, immediate: true });
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

.schema-preview {
  max-height: 140px;
  padding: 8px;
  margin: 0;
  overflow: auto;
  font-family: var(--font-family-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace);
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-secondary);
  white-space: pre-wrap;
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
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
