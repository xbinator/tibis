<template>
  <BSettingsPage :title="MENU_ITEMS['service-model'].label">
    <ServiceConfig
      service-type="chat"
      title="智能对话助手"
      description="指定用于智能对话的模型"
      :options="CHAT_SERVICE_CONFIG_OPTIONS"
      :show-prompt="false"
      @change="handleChatConfigChange"
    />

    <ServiceConfig
      service-type="polish"
      title="内容编辑助手"
      description="指定用于内容编辑的模型"
      :options="POLISH_SERVICE_CONFIG_OPTIONS"
      :default-prompt="POLISH_DEFAULT_PROMPT"
    />
  </BSettingsPage>
</template>

<script setup lang="ts">
import { useServiceModelStore } from '@/stores/ai/serviceModel';
import { MENU_ITEMS } from '@/views/settings/constants';
import ServiceConfig from './components/ServiceConfig.vue';
import { CHAT_SERVICE_CONFIG_OPTIONS, POLISH_DEFAULT_PROMPT, POLISH_SERVICE_CONFIG_OPTIONS } from './constants';

const serviceModelStore = useServiceModelStore();

/**
 * 处理 chat 服务配置变更。
 * 同步更新 serviceModelStore.chatModel 以保持 UI 响应式同步。
 */
function handleChatConfigChange(payload: { providerId?: string; modelId?: string; customPrompt?: string }): void {
  if (!payload.providerId || !payload.modelId) return;

  serviceModelStore.updateChatModelState({ providerId: payload.providerId, modelId: payload.modelId });
}
</script>
