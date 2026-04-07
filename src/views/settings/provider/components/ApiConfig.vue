<template>
  <div class="config-section">
    <h3 class="section-title">API 配置</h3>
    <AForm layout="vertical">
      <AFormItem label="API Key" required>
        <AInputPassword v-model:value="dataItem.apiKey" placeholder="请输入 API Key" />
      </AFormItem>
      <AFormItem label="API 代理地址">
        <AInput v-model:value="dataItem.baseUrl" placeholder="例如: https://api.example.com" />
      </AFormItem>
    </AForm>

    <div class="connection-test">
      <h4 class="test-title">连通性检查</h4>
      <p class="test-desc">测试 API Key 与代理地址是否正确配置</p>
      <div class="test-actions">
        <BSelect v-model:value="testModel" :options="modelOptions" placeholder="选择测试模型" class="model-select" />
        <BButton type="primary" :loading="testing" :disabled="!testModel" @click="handleTestClick">检查</BButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Provider } from '../types';
import { computed, ref, watch } from 'vue';
import BButton from '@/components/BButton/index.vue';

interface TestModelOption {
  id: string;
  name: string;
  isEnabled: boolean;
}

interface Props {
  models: TestModelOption[];
  testing?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  testing: false
});

const emit = defineEmits<{
  (e: 'test', modelId: string): void;
}>();

const dataItem = defineModel<Partial<Provider>>('value', { default: () => ({}) });

const testModel = ref<string | undefined>(undefined);

const modelOptions = computed(() =>
  props.models
    .filter((model: TestModelOption) => model.isEnabled)
    .map((model: TestModelOption) => ({
      label: model.name,
      value: model.id
    }))
);

function handleTestClick(): void {
  if (!testModel.value) {
    return;
  }

  emit('test', testModel.value);
}

watch(
  () => props.models,
  (nextModels: TestModelOption[]) => {
    const enabledModel = nextModels.find((model: TestModelOption) => model.isEnabled);
    const hasSelectedModel = nextModels.some((model: TestModelOption) => model.id === testModel.value && model.isEnabled);

    if (!hasSelectedModel) {
      testModel.value = enabledModel?.id;
    }
  },
  { immediate: true, deep: true }
);
</script>

<style scoped lang="less">
.config-section {
  padding: 20px;
  background: var(--bg-secondary);
  border-radius: 10px;
}

.section-title {
  margin: 0 0 16px;
  font-size: 16px;
  font-weight: 500;
  color: var(--text-primary);
}

.connection-test {
  padding: 16px;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
}

.test-title {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.test-desc {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--text-secondary);
}

.test-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.model-select {
  flex: 1;
}
</style>
