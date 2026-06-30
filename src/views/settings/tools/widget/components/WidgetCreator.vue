<!--
  @file WidgetCreator.vue
  @description 小组件创建弹窗，负责创建表单输入与标识符校验。
-->
<template>
  <BModal v-model:open="visible" title="创建小组件" :width="480" @close="handleCancel">
    <AForm layout="vertical">
      <div class="widget-creator">
        <BUpload
          v-model:drag-over="isImportDragOver"
          accept=".zip"
          draggable
          class="widget-creator__dropzone"
          :class="{ 'widget-creator__dropzone--active': isImportDragOver }"
          @change="handleZipSelected"
        >
          <BIcon class="widget-creator__dropzone-icon" icon="lucide:package-plus" :size="26" />
          <div class="widget-creator__dropzone-title">拖拽 .zip 到此处或点击添加</div>
          <div v-if="importedSourceName" class="widget-creator__dropzone-file">{{ importedSourceName }}</div>
        </BUpload>

        <AFormItem class="widget-creator__id" label="标识" required v-bind="validateInfos.id">
          <AInput v-model:value="dataItem.id" placeholder="例如 weather" @blur="handleIdBlur" />
        </AFormItem>

        <AFormItem class="widget-creator__name" label="名称" required v-bind="validateInfos.name">
          <AInput v-model:value="dataItem.name" placeholder="例如 天气" />
        </AFormItem>

        <AFormItem class="widget-creator__description" label="描述" v-bind="validateInfos.description">
          <ATextarea
            v-model:value="dataItem.description"
            :auto-size="{ minRows: 3, maxRows: 5 }"
            placeholder="描述这个小组件能做什么、适合什么场景，帮助 AI 判断何时展示"
          />
        </AFormItem>
      </div>
    </AForm>

    <template #footer>
      <BButton type="secondary" @click="handleCancel">取消</BButton>
      <BButton type="primary" @click="handleConfirm">保存</BButton>
    </template>
  </BModal>
</template>

<script setup lang="ts">
import type { Rule } from 'ant-design-vue/es/form';
import { reactive, ref, shallowRef, watch } from 'vue';
import { Form, message } from 'ant-design-vue';
import { cloneDeep } from 'lodash-es';
import { importWidgetZipFile, type WidgetImportResource } from '@/ai/widget';
import type { WidgetData } from '@/components/BWidget/types';
import { asyncTo } from '@/utils/asyncTo';

/**
 * 创建小组件提交数据。
 */
export interface WidgetCreatePayload {
  /** 小组件标识。 */
  id: string;
  /** 小组件名称。 */
  name: string;
  /** 小组件描述。 */
  description: string;
  /** 从 zip 导入的小组件数据。 */
  data?: WidgetData;
  /** 从 zip 导入的小组件资源文件。 */
  resources?: WidgetImportResource[];
}

/** 小组件标识符，仅允许英文、数字、下划线和短横线。 */
const WIDGET_ID_PATTERN = /^[A-Za-z0-9_-]+$/u;

const emit = defineEmits<{
  confirm: [payload: WidgetCreatePayload];
}>();

/** 弹窗可见性。 */
const visible = defineModel<boolean>('open', { default: false });

/** 表单数据。 */
const dataItem = reactive<WidgetCreatePayload>({
  id: '',
  name: '',
  description: ''
});
/** 当前是否有 zip 文件拖拽悬停。 */
const isImportDragOver = ref(false);
/** 已导入的小组件数据。 */
const importedWidgetData = shallowRef<WidgetData | null>(null);
/** 已导入的小组件资源。 */
const importedWidgetResources = shallowRef<WidgetImportResource[]>([]);
/** 已导入来源文件名。 */
const importedSourceName = ref('');

/** 表单校验规则。 */
const rules = reactive<Record<string, Rule[]>>({
  id: [
    { required: true, message: '请输入小组件标识' },
    {
      pattern: WIDGET_ID_PATTERN,
      message: '标识只能包含英文、数字、下划线和短横线'
    }
  ],
  name: [{ required: true, message: '请输入小组件名称' }],
  description: []
});

const { resetFields, validate, validateInfos } = Form.useForm(dataItem, rules);

/**
 * 执行表单校验。
 * @returns 校验结果元组
 */
const onValidate = () => asyncTo(validate());

/**
 * 规范化小组件标识。
 */
function handleIdBlur(): void {
  dataItem.id = dataItem.id.trim().toLowerCase();
}

/**
 * 清空 zip 导入态。
 */
function resetImportedWidgetPackage(): void {
  importedWidgetData.value = null;
  importedWidgetResources.value = [];
  importedSourceName.value = '';
}

/**
 * 应用 zip 导入结果到创建表单。
 * @param file - zip 文件
 * @returns 导入完成信号
 */
async function importWidgetFromZipFile(file: File): Promise<void> {
  const result = await importWidgetZipFile(file);

  importedWidgetData.value = result.data;
  importedWidgetResources.value = result.resources;
  importedSourceName.value = result.sourceName;
  dataItem.id = result.suggestedId;
  dataItem.name = result.data.name || result.suggestedId;
  dataItem.description = result.data.description;
  message.success(`已导入 ${result.sourceName}`);
}

/**
 * 处理 zip 文件选择或拖拽添加。
 * @param files - 文件列表
 * @returns 处理完成信号
 */
async function handleZipSelected(files: FileList): Promise<void> {
  const file = files[0];

  if (!file) {
    return;
  }

  resetImportedWidgetPackage();

  const [error] = await asyncTo(importWidgetFromZipFile(file));

  if (error) {
    message.error(error instanceof Error ? error.message : '导入小组件失败');
  }
}

/**
 * 取消创建小组件。
 */
function handleCancel(): void {
  visible.value = false;
}

/**
 * 确认创建小组件。
 * @returns 创建确认完成信号
 */
async function handleConfirm(): Promise<void> {
  dataItem.id = dataItem.id.trim().toLowerCase();
  dataItem.name = dataItem.name.trim();
  dataItem.description = dataItem.description.trim();

  const [error] = await onValidate();

  if (error) {
    return;
  }

  emit('confirm', {
    id: dataItem.id,
    name: dataItem.name,
    description: dataItem.description,
    ...(importedWidgetData.value ? { data: cloneDeep(importedWidgetData.value) } : {}),
    ...(importedWidgetResources.value.length > 0 ? { resources: importedWidgetResources.value } : {})
  });
}

watch(
  () => visible.value,
  (open: boolean): void => {
    if (open) {
      resetFields();
      resetImportedWidgetPackage();
      isImportDragOver.value = false;
    }
  }
);
</script>

<style scoped lang="less">
.widget-creator {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.widget-creator__dropzone {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  justify-content: center;
  min-height: 112px;
  margin-bottom: 4px;
  color: var(--text-secondary);
  cursor: pointer;
  background: var(--bg-secondary);
  border: 1px dashed var(--border-secondary);
  border-radius: 8px;
  transition: color 0.2s ease, background-color 0.2s ease, border-color 0.2s ease;
}

.widget-creator__dropzone:hover,
.widget-creator__dropzone--active {
  color: var(--color-primary);
  background: var(--bg-hover);
  border-color: var(--color-primary);
}

.widget-creator__dropzone-icon {
  color: currentColor;
}

.widget-creator__dropzone-title {
  font-size: 13px;
  color: var(--text-secondary);
}

.widget-creator__dropzone:hover .widget-creator__dropzone-title,
.widget-creator__dropzone--active .widget-creator__dropzone-title {
  color: var(--color-primary);
}

.widget-creator__dropzone-file {
  max-width: 100%;
  padding: 2px 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: var(--color-primary);
  white-space: nowrap;
  background: var(--color-primary-bg);
  border-radius: 4px;
}
</style>
