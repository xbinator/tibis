<template>
  <AConfigProvider :locale="zhCN" :theme="antdTheme">
    <RouterView />
  </AConfigProvider>
</template>

<script lang="ts" setup>
import zhCN from 'ant-design-vue/es/locale/zh_CN';
import 'dayjs/locale/zh-cn';
import { useAntdTheme } from '@/hooks/useAntdTheme';
import { useMenuAction } from '@/hooks/useMenuAction';
import { useSystem } from '@/hooks/useSystem';

const { antdTheme } = useAntdTheme();
useMenuAction();

// 引导系统级事件监听（macOS "打开方式" 等）
useSystem();
</script>

<style>
#app {
  height: 100%;
}
</style>
