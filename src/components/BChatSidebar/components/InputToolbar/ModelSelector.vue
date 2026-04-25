<template>
  <BDropdown v-model:open="open">
    <BButton square size="small" type="text">
      <div class="model-button-content">
        <BModelIcon v-if="currentProviderId" :provider="currentProviderId" :size="16" />
        <Icon v-else icon="lucide:bot" width="16" height="16" />
        <span v-if="currentModelName" class="model-name">{{ currentModelName }}</span>
      </div>
    </BButton>

    <template #overlay>
      <div class="model-selector">
        <div class="model-group">
          <template v-for="group in groupedModels" :key="group.providerId">
            <div class="model-group__header">{{ group.providerName }}</div>
            <div
              v-for="item in group.models"
              :key="item.value"
              class="model-selector__item"
              :class="{ 'is-active': item.value === internalModel }"
              @click="handleModelChange(item.value)"
            >
              <BModelIcon :model="item.modelId" :size="16" />
              <span class="model-selector__name">{{ item.modelName }}</span>
            </div>
          </template>
        </div>
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
import { providerStorage, serviceModelsStorage } from '@/shared/storage';
import { dispatchServiceModelUpdated } from '@/shared/storage/service-models/events';

interface ModelItem {
  value: string;
  modelId: string;
  modelName: string;
}

interface ModelGroup {
  providerId: string;
  providerName: string;
  models: ModelItem[];
}

interface Props {
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

const currentModelName = computed<string>(() => {
  if (!internalModel.value) return '';
  const match = internalModel.value.match(/^([^:]+):(.+)$/);
  const modelId = match?.[2];
  const provider = providers.value.find((p) => p.id === currentProviderId.value);
  if (!provider || !modelId) return '';
  const model = provider.models.find((m) => m.id === modelId);
  return model?.name || '';
});

const groupedModels = computed<ModelGroup[]>(() => {
  return providers.value
    .filter((provider) => provider.isEnabled && provider.models?.length)
    .map((provider) => ({
      providerId: provider.id,
      providerName: provider.name,
      models: provider.models
        .filter((model) => model.isEnabled)
        .map((model) => ({
          value: `${provider.id}:${model.id}`,
          modelId: model.id,
          modelName: model.name
        }))
    }))
    .filter((group) => group.models.length > 0);
});

async function loadProviders(): Promise<void> {
  providers.value = await providerStorage.listProviders();
}

async function loadSavedConfig(): Promise<void> {
  const config = await serviceModelsStorage.getConfig('chat');
  internalModel.value = config?.providerId && config?.modelId ? `${config.providerId}:${config.modelId}` : undefined;
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
  width: 260px;
  padding: 6px;
  max-height: 360px;
  overflow-y: auto;
}

.model-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.model-group + .model-group {
  margin-top: 4px;
}

.model-group__header {
  padding: 4px 8px 2px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.model-selector__item {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 8px;
  cursor: pointer;
  border-radius: 6px;
  transition: background-color 0.15s ease;

  &:hover {
    background: var(--bg-hover);
  }

  &.is-active {
    background: var(--bg-active, var(--bg-hover));
  }
}

.model-selector__name {
  font-size: 13px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-button-content {
  display: flex;
  align-items: center;
  gap: 6px;
}

.model-name {
  max-width: 80px;
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  color: var(--text-primary);
  white-space: nowrap;
}
</style>
