<!--
  @file WidgetCreator.vue
  @description 小组件创建弹窗，负责创建表单输入与标识符校验。
-->
<template>
  <BModal v-model:open="visible" title="创建小组件" :width="480" @close="handleCancel">
    <AForm layout="vertical">
      <div class="widget-creator">
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
import { reactive, watch } from 'vue';
import { Form } from 'ant-design-vue';
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
    description: dataItem.description
  });
}

watch(
  () => visible.value,
  (open: boolean): void => {
    if (open) {
      resetFields();
    }
  }
);
</script>

<style scoped lang="less">
.widget-creator {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
</style>
