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
    </ATabPane>
  </ATabs>

  <SchemaEditor v-model:open="schemaEditorOpen" :kind="activeSchemaKind" :schema="activeSchema" @confirm="handleSchemaEditorConfirm" />
  <SchemaHelp v-model:open="schemaHelpDrawerOpen" :kind="activeSchemaHelpKind" />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { DrawingData, DrawingMetadata, DrawingSchemaObject } from '@/components/BDrawing/types';
import type { DrawingSchemaKind } from '@/components/BDrawing/utils/drawingData';
import SchemaEditor from './PageSetter/SchemaEditor.vue';
import SchemaHelp from './PageSetter/SchemaHelp.vue';

/**
 * 画布设置面板入参。
 */
interface Props {
  /** 当前画板元信息 */
  metadata: DrawingMetadata;
}

defineProps<Props>();

const drawingData = defineModel<DrawingData>('value', { required: true });

/** Schema 编辑弹窗开关状态。 */
const schemaEditorOpen = ref(false);
/** 当前编辑的 schema 类型。 */
const activeSchemaKind = ref<DrawingSchemaKind>('input');
/** Schema 填写说明抽屉开关。 */
const schemaHelpDrawerOpen = ref(false);
/** 当前说明抽屉对应的 schema 类型。 */
const activeSchemaHelpKind = ref<DrawingSchemaKind>('input');

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

/** 当前正在编辑的 Schema。 */
const activeSchema = computed<DrawingSchemaObject>(() => (activeSchemaKind.value === 'input' ? drawingData.value.inputSchema : drawingData.value.outputSchema));
/** 入参 schema 预览文本。 */
const inputSchemaPreview = computed<string>(() => formatSchemaText(drawingData.value.inputSchema));
/** 出参 schema 预览文本。 */
const outputSchemaPreview = computed<string>(() => formatSchemaText(drawingData.value.outputSchema));
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
</style>
