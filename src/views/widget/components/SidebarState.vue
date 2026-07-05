<!--
  @file SidebarState.vue
  @description 侧边栏数据源 schema 配置面板，承载入参字段定义与编辑。
-->
<template>
  <SidebarPanel title="数据源">
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
      <BButton icon="lucide:plus" size="mini" square type="secondary" @click="addRootSchemaField" />
      <BButton size="mini" type="secondary" @click="openSchemaInputEditor('input')">编辑</BButton>
    </template>
    <div class="schema-body">
      <SchemaTreeEditor v-model:schema="inputSchema" />
    </div>
  </SidebarPanel>

  <!-- Schema JSON 编辑弹窗 -->
  <SchemaInputEditor v-model:open="schemaInputEditorOpen" :kind="activeSchemaKind" :schema="activeSchema" @confirm="handleSchemaInputEditorConfirm" />
  <!-- Schema 填写说明抽屉 -->
  <SchemaHelp v-model:open="schemaHelpDrawerOpen" :kind="activeSchemaHelpKind" />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { cloneDeep, has } from 'lodash-es';
import type { WidgetData, WidgetSchemaObject, WidgetSchemaProperty } from '@/components/BWidget/types';
import type { WidgetSchemaKind } from '@/components/BWidget/utils/widgetData';
import { WIDGET_SCHEMA_DEFAULT_FIELD_NAME } from '../constants/pageSetter';
import SidebarPanel from './_SidebarPanel.vue';
import SchemaHelp from './PageSetter/SchemaHelp.vue';
import SchemaInputEditor from './PageSetter/SchemaInputEditor.vue';
import SchemaTreeEditor from './PageSetter/SchemaTreeEditor.vue';

defineOptions({ name: 'SidebarState' });

const dataItem = defineModel<WidgetData>('value', { required: true });

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
function updateWidgetDataConfig(patch: Partial<Pick<WidgetData, 'description' | 'inputSchema' | 'name'>>): void {
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
 * 写入当前 Widget 的入参 schema。
 * @param schema - 新入参 schema
 */
function updateWidgetSchema(schema: WidgetSchemaObject): void {
  updateWidgetDataConfig({ inputSchema: schema });
}

/**
 * 添加根级入参 schema 字段。
 */
function addRootSchemaField(): void {
  const nextSchema = cloneDeep(dataItem.value.inputSchema);
  const fieldName = createUniqueRootSchemaFieldName(nextSchema);

  nextSchema.properties[fieldName] = createDefaultSchemaField();

  updateWidgetSchema(nextSchema);
}

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

/** 当前正在编辑的 Schema。 */
const activeSchema = inputSchema;

/**
 * 打开 Schema JSON 编辑弹窗。
 * @param kind - schema 类型
 */
function openSchemaInputEditor(kind: WidgetSchemaKind): void {
  activeSchemaKind.value = kind;
  schemaInputEditorOpen.value = true;
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
  updateWidgetSchema(schema);
}
</script>

<style lang="less" scoped>
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
</style>
