<template>
  <div class="b-layout">
    <div class="b-layout-header">
      <!--
        为 macOS 的原生红绿灯按钮留出空间。
        在 macOS 下：
        - 普通模式或最大化时，系统会在左上角显示红绿灯，我们需要留出 60px 的宽度避免内容重叠。
        - 全屏模式时，系统原生红绿灯会隐藏，此时取消占位，让内容紧贴左侧边缘。
      -->
      <div v-if="platform === 'mac' && !isFullScreen" class="b-layout-header__mac-spacer"></div>

      <div class="b-layout-header__content" :class="{ 'is-mac': platform === 'mac' }">
        <template v-if="!isMac()">
          <div class="b-layout-header__left">
            <BToolbar :title="'文件'" :options="toolbarFileOptions" />
            <BToolbar :title="'编辑'" :options="toolbarEditOptions" />
            <BToolbar :title="'视图'" show-selected-check :options="toolbarViewOptions" />
            <BToolbar :title="'帮助'" :options="toolbarHelpOptions" />
          </div>
          <!-- 分割线 -->
          <div class="b-layout-header__divider"></div>
        </template>
        <div class="b-layout-header__center">
          <HeaderTabs />
        </div>
        <div class="b-layout-header__right">
          <HeaderUpdateNotice />
          <HeaderEditorActions />
          <!-- 搜索按钮 -->
          <BButton type="secondary" size="small" square @click="visible.searchRecent = true">
            <Icon icon="tabler:search" width="16" height="16" />
          </BButton>
          <!-- 辅助工具侧边栏切换按钮 -->
          <BButton type="secondary" size="small" square @click="handleToggleSidebar">
            <Icon :icon="settingStore.sidebarVisible ? 'tabler:layout-sidebar-right-filled' : 'tabler:layout-sidebar-right'" width="16" height="16" />
          </BButton>

          <BButton type="secondary" size="small" square @click="handleOpenSettings">
            <Icon icon="tabler:settings" width="16" height="16" />
          </BButton>
        </div>
      </div>

      <template v-if="platform === 'win'">
        <div class="b-layout-header__divider"></div>
        <div class="b-layout-header__controls">
          <button class="b-layout-header__button" @click="handleMinimize">
            <Icon icon="lucide:minus" width="14" height="14" />
          </button>
          <button class="b-layout-header__button" @click="handleMaximize">
            <Icon v-if="isMaximized" icon="lucide:copy" width="14" height="14" />
            <Icon v-else icon="lucide:square" width="14" height="14" />
          </button>
          <button class="b-layout-header__button b-layout-header__button--close" @click="handleClose">
            <Icon icon="lucide:x" width="14" height="14" />
          </button>
        </div>
      </template>
    </div>

    <div class="b-layout__content">
      <div class="b-layout__content__main">
        <RouterView v-slot="{ Component, route }">
          <KeepAlive :include="tabsStore.cachedComponentNames">
            <component :is="getRouteCacheComponent(route)" v-if="Component" :key="getRouteCacheKey(route)" :route-component="Component" />
          </KeepAlive>
        </RouterView>
      </div>

      <ChatSider v-if="settingStore.sidebarVisible" />
    </div>

    <BSearchRecent v-if="visible.searchRecent" v-model:visible="visible.searchRecent" />

    <ShortcutsHelp v-if="visible.shortcutsHelp" v-model:visible="visible.shortcutsHelp" />
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@iconify/vue';
import { useEventListener } from '@vueuse/core';
import BButton from '@/components/BButton/index.vue';
import { getElectronAPI } from '@/shared/platform/electron-api';
import { isMac } from '@/shared/platform/env';
import { useSettingStore } from '@/stores/ui/setting';
import { useTabsStore } from '@/stores/workspace/tabs';
import HeaderEditorActions from './components/HeaderEditorActions.vue';
import HeaderTabs from './components/HeaderTabs.vue';
import HeaderUpdateNotice from './components/HeaderUpdateNotice.vue';
import { useEditActive } from './hooks/useEditActive';
import { useFileActive } from './hooks/useFileActive';
import { useHelpActive } from './hooks/useHelpActive';
import { useKeepAlive } from './hooks/useKeepAlive';
import { useViewActive } from './hooks/useViewActive';

const router = useRouter();

const visible = reactive({ searchRecent: false, shortcutsHelp: false });

const settingStore = useSettingStore();
const tabsStore = useTabsStore();
const { getRouteCacheKey, getRouteCacheComponent } = useKeepAlive();

/** 聊天侧栏体量较大，首屏隐藏时延迟加载以减少首次白屏等待。 */
const ChatSider = defineAsyncComponent(() => import('./components/ChatSider.vue'));
/** 最近记录搜索弹窗仅在打开时加载，避免首屏提前解析搜索组件依赖。 */
const BSearchRecent = defineAsyncComponent(() => import('@/components/BSearchRecent/index.vue'));
/** 快捷键帮助抽屉仅在打开时加载，减少默认布局首屏组件体积。 */
const ShortcutsHelp = defineAsyncComponent(() => import('./components/ShortcutsHelp.vue'));

const { toolbarFileOptions } = useFileActive(visible);
const { toolbarEditOptions } = useEditActive();
const { toolbarViewOptions } = useViewActive();
const { toolbarHelpOptions } = useHelpActive(visible);

onMounted(() => {
  tabsStore.subscribeToFileWatchEvents();
});

onUnmounted(() => {
  tabsStore.unsubscribeFromFileWatchEvents();
});

/**
 * 打开设置页。
 */
function handleOpenSettings(): void {
  router.push('/settings');
}

/**
 * 切换右侧辅助栏显示状态。
 * 如果侧边栏宽度为 0（通过拖拽关闭），重新打开时恢复为默认宽度 340px。
 */
function handleToggleSidebar(): void {
  if (!settingStore.sidebarVisible && settingStore.sidebarWidth === 0) {
    settingStore.setSidebarWidth(340);
  }
  settingStore.toggleSidebar();
}

// --- Window Controls ---
const api = getElectronAPI();
const platform = computed(() => (isMac() ? 'mac' : 'win'));
const isMaximized = ref(false);
const isFullScreen = ref(false);

/**
 * 同步窗口最大化和全屏状态。
 */
function validateWindowState(): void {
  // 读取最大化状态用于切换窗口按钮图标。
  api?.windowIsMaximized?.().then((value) => (isMaximized.value = value));
  // 读取全屏状态用于 macOS 标题栏占位。
  api?.windowIsFullScreen?.().then((value) => (isFullScreen.value = value));
}

/**
 * 最小化当前窗口。
 */
function handleMinimize(): void {
  api?.windowMinimize();
}

/**
 * 切换当前窗口最大化状态。
 */
function handleMaximize(): void {
  api?.windowMaximize();

  validateWindowState();
}

/**
 * 关闭当前窗口。
 */
function handleClose(): void {
  api?.windowClose();
}

validateWindowState();
useEventListener(window, 'resize', validateWindowState);
</script>

<style lang="less">
.b-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-secondary);
}

.b-layout-header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  width: 100%;
  height: 36px;
  -webkit-app-region: drag;

  button {
    -webkit-app-region: no-drag;
  }
}

.b-layout__content {
  position: relative;
  display: flex;
  flex: 1;
  gap: 6px;
  height: 0;
  padding-bottom: 6px;
  margin: 0 6px;

  .b-layout__content__main {
    flex: 1;
    width: 0;
  }
}

.b-layout-header__mac-spacer {
  flex-shrink: 0;
  width: 60px;
  height: 100%;
}

.b-layout-header__content {
  display: flex;
  flex: 1;
  align-items: center;
  height: 100%;

  &.is-mac {
    padding: 0 12px;

    .b-layout-header__center {
      margin-left: 12px;
    }
  }
}

.b-layout-header__center {
  display: flex;
  flex: 1;
  align-items: center;
  width: 0;
  height: 100%;
  -webkit-app-region: drag;
}

.b-layout-header__divider {
  width: 1px;
  height: 16px;
  margin: 0 6px;
  background-color: var(--border-secondary);
}

.b-layout-header__controls {
  display: flex;
  height: 100%;
}

.b-layout-header__button {
  width: 46px;
  height: 100%;
  color: var(--text-primary);
  cursor: pointer;
  outline: none;
  background: transparent;
  border: none;
  transition: background-color 0.2s;
}

.b-layout-header__button:hover {
  background-color: var(--bg-hover);
}

.b-layout-header__left,
.b-layout-header__right {
  display: flex;
  gap: 4px;
  align-items: center;
  height: 100%;

  &:empty {
    display: none;
  }
}

.b-layout-header__left {
  padding-left: 8px;
}

.b-dropdown-menu-item.is-active {
  color: var(--color-primary);
  background-color: var(--color-primary-bg);
}
</style>
