<template>
  <AConfigProvider :locale="zhCN" :theme="antdTheme">
    <RouterView />
  </AConfigProvider>
</template>

<script lang="ts" setup>
import { computed, onMounted, onUnmounted } from 'vue';
import zhCN from 'ant-design-vue/es/locale/zh_CN';
import theme from 'ant-design-vue/es/theme';
import { native } from '@/shared/platform';
import { useSettingStore } from '@/stores/setting';
import { emitter } from '@/utils/emitter';

const { darkAlgorithm, defaultAlgorithm } = theme;
const settingStore = useSettingStore();

let unregisterMenuAction: (() => void) | undefined;

function handleMenuAction(action: string) {
  switch (action) {
    // 文件操作
    case 'file:new':
      emitter.emit('file:new');
      break;
    case 'file:open':
      emitter.emit('file:open');
      break;
    case 'file:duplicate':
      emitter.emit('file:duplicate');
      break;
    case 'file:save':
      emitter.emit('file:save');
      break;
    case 'file:saveAs':
      emitter.emit('file:saveAs');
      break;
    case 'file:rename':
      emitter.emit('file:rename');
      break;
    case 'file:clear-content':
      emitter.emit('file:clear-content');
      break;
    case 'file:remove-current':
      emitter.emit('file:remove-current');
      break;

    // 编辑操作
    case 'edit:undo':
      emitter.emit('edit:undo');
      break;
    case 'edit:redo':
      emitter.emit('edit:redo');
      break;
    case 'edit:copy-plain-text':
      emitter.emit('edit:copyPlainText');
      break;
    case 'edit:copy-markdown':
      emitter.emit('edit:copyMarkdown');
      break;
    case 'edit:copy-html':
      emitter.emit('edit:copyHtml');
      break;

    // 视图操作
    case 'view:toggleSource':
      settingStore.toggleSourceMode();
      break;
    case 'view:toggleOutline':
      settingStore.toggleOutline();
      break;
    case 'theme:light':
      settingStore.setTheme('light');
      break;
    case 'theme:dark':
      settingStore.setTheme('dark');
      break;
    case 'theme:system':
      settingStore.setTheme('system');
      break;

    // 帮助操作
    case 'help:shortcuts':
      emitter.emit('help:shortcuts');
      break;

    default:
      break;
  }
}

onMounted(() => {
  settingStore.init();

  // 监听菜单操作事件
  if (native.onMenuAction) {
    unregisterMenuAction = native.onMenuAction((action: string) => {
      handleMenuAction(action);
    });
  }
});

onUnmounted(() => {
  if (unregisterMenuAction) {
    unregisterMenuAction();
  }
});

const antdTheme = computed(() => ({
  algorithm: settingStore.resolvedTheme === 'dark' ? darkAlgorithm : defaultAlgorithm,
  token: {
    colorPrimary: '#1677ff'
  }
}));
</script>

<style>
#app {
  height: 100%;
}
</style>
