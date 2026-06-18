<template>
  <BSettingsPage :title="MENU_ITEMS['service-model'].label">
    <ServiceConfig service-type="polish" title="内容编辑助手" description="指定用于内容编辑的模型" :show-prompt="false" />
  </BSettingsPage>
</template>

<script setup lang="ts">
import { MENU_ITEMS } from '@/views/settings/constants';
import ServiceConfig from './components/ServiceConfig.vue';
</script>
