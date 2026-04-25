<template>
  <BDropdown v-model:open="open">
    <BButton square size="small" type="text">
      <BModelIcon v-if="currentProviderId" :provider="currentProviderId" :size="16" />
      <Icon v-else icon="lucide:bot" width="16" height="16" />
    </BButton>

    <template #overlay>
      <div class="model-selector">
        <BSelect
          v-model:value="internalModel"
          :options="modelOptions"
          placeholder="请选择模型"
          :show-arrow="false"
          :style="{ width: '280px' }"
          @change="handleModelChange"
        >
          <template #option="{ modelId, modelName, providerName }">
            <div class="flex items-center gap-6">
              <BModelIcon :model="modelId" :size="16" />
              <div class="flex-1 w-0 truncate">{{ modelName }}</div>
              <div class="fs-12">{{ providerName }}</div>
            </div>
          </template>
        </BSelect>
      </div>
    </template>
  </BDropdown>
</template>

<script setup lang="ts">
import type { AIProvider } from 'types/ai';
import { computed, onMounted, ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import BButton from '@/components/BButton/index.vue';
import BDropdown from '@/components/BDropdown/index.vue';
import BModelIcon from '@/components/BModelIcon/index.vue';
import BSelect from '@/components/BSelect/index.vue';
import { providerStorage, serviceModelsStorage } from '@/shared/storage';
import { dispatchServiceModelUpdated } from '@/shared/storage/service-models/events';

interface ModelOption {
  value: string;
  modelId: string;
  modelName: string;
  providerName: string;
}

interface Props {
  /** 当前选中的模型 (providerId:modelId) */
  model: string | undefined;
}

const props = withDefaults(defineProps<Props>(), {
  model: undefined
});

const emit = defineEmits<{
  (e: 'update:model', value: string): void;
}>();

const open = ref(false);
const providers = ref<AIProvider[]>([]);
const internalModel = ref<string>();

const currentProviderId = computed<string | undefined>(() => {
  if (!internalModel.value) return undefined;
  const match = internalModel.value.match(/^([^:]+):(.+)$/);
  return match?.[1];
});

const modelOptions = computed<ModelOption[]>(() => {
  return providers.value.flatMap((provider) => {
    if (!provider.isEnabled || !provider.models?.length) {
      return [];
    }

    return provider.models
      .filter((model) => model.isEnabled)
      .map((model) => ({
        value: `${provider.id}:${model.id}`,
        modelId: model.id,
        modelName: model.name,
        providerName: provider.name
      }));
  });
});

async function loadProviders(): Promise<void> {
  providers.value = await providerStorage.listProviders();
}

async function loadSavedConfig(): Promise<void> {
  const config = await serviceModelsStorage.getConfig('chat');
  internalModel.value = config?.providerId && config?.modelId
    ? `${config.providerId}:${config.modelId}`
    : undefined;
}

function handleModelChange(value: string): void {
  const [, providerId, modelId] = value.match(/^([^:]+):(.+)$/) ?? [];

  if (providerId && modelId) {
    serviceModelsStorage.saveConfig('chat', { providerId, modelId });
    dispatchServiceModelUpdated('chat');
  }

  emit('update:model', value);
  open.value = false;
}

watch(
  () => props.model,
  (value) => {
    internalModel.value = value;
  },
  { immediate: true }
);

onMounted(async () => {
  await Promise.all([loadProviders(), loadSavedConfig()]);
});
</script>

<style scoped lang="less">
.model-selector {
  padding: 4px;
  width: 280px;
}
</style>
