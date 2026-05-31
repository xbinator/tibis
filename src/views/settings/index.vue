<template>
  <div class="settings-container">
    <div class="settings-sidebar" :class="{ 'settings-sidebar--collapsed': sidebarCollapsed }" draggable="false">
      <template v-for="(group, gi) in menuGroups" :key="gi">
        <div v-if="gi > 0" class="sidebar-divider"></div>
        <ATooltip v-for="item in group.items" :key="item.key" :title="sidebarCollapsed ? item.label : undefined" placement="right">
          <div class="sidebar-item" :class="{ active: isActive(item.path) }" draggable="false" @click="navigateTo(item)">
            <Icon :icon="item.icon" class="sidebar-item__icon" />
            <span class="sidebar-item__label">{{ item.label }}</span>
          </div>
        </ATooltip>
      </template>

      <button type="button" class="sidebar-collapse-btn" :title="sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'" @click="toggleSidebarCollapsed">
        <Icon :icon="sidebarCollapsed ? 'lucide:panel-right-open' : 'lucide:panel-right-close'" width="14" height="14" />
      </button>
    </div>

    <div class="settings-content">
      <RouterView />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MenuItem } from './constants';
import { useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { Icon } from '@iconify/vue';
import { useSettingStore } from '@/stores/ui/setting';
import { menuGroups } from './constants';

const route = useRoute();
const router = useRouter();
const settingStore = useSettingStore();
const { settingsSidebarCollapsed: sidebarCollapsed } = storeToRefs(settingStore);

/**
 * 切换侧边栏折叠状态
 */
function toggleSidebarCollapsed(): void {
  settingStore.setSettingsSidebarCollapsed(!sidebarCollapsed.value);
}

/**
 * 判断菜单项是否为当前激活状态。
 * @param path - 菜单项对应的路由路径
 */
function isActive(path: string): boolean {
  return route.path === path || route.path.startsWith(`${path}/`);
}

/**
 * 导航到指定菜单项，若当前已在目标路径则忽略。
 * @param item - 菜单项
 */
function navigateTo(item: MenuItem): void {
  if (isActive(item.path)) return;
  router.push(item.path);
}
</script>

<style scoped lang="less">
.settings-container {
  --sidebar-width-large: 230px;
  --sidebar-width-small: 42px;

  display: flex;
  height: 100%;
}

.settings-sidebar {
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  width: var(--sidebar-width-large);
  height: 100%;
  padding: 16px 8px 12px 2px;
  overflow-y: auto;
  transition: width 0.3s ease;
  -webkit-user-drag: none;

  &--collapsed {
    width: var(--sidebar-width-small);

    .sidebar-item {
      gap: 0;
      justify-content: center;
      padding: 0;
    }

    .sidebar-item__label {
      width: 0;
      opacity: 0;
    }
  }
}

.settings-header-back {
  display: flex;
  gap: 8px;
  align-items: center;
  height: 40px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  cursor: pointer;
  transition: color 0.15s;

  &:hover {
    color: var(--color-primary);
  }
}

.sidebar-divider {
  height: 1px;
  margin: 4px 12px 8px;
  background: var(--border-primary);
}

.settings-sidebar--collapsed .sidebar-divider {
  display: none;
}

.sidebar-item {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: flex-start;
  height: 32px;
  padding: 0 14px;
  margin-bottom: 8px;
  font-size: 14px;
  color: var(--text-primary);
  text-decoration: none;
  cursor: pointer;
  user-select: none;
  -webkit-user-drag: none;
  border-radius: 6px;
  transition: all 0.15s;

  &:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  &.active {
    background: var(--color-primary-bg);
  }
}

.sidebar-item__icon {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
}

.sidebar-item__label {
  overflow: hidden;
  white-space: nowrap;
  transition: opacity 0.3s ease, width 0.3s ease;
}

.sidebar-collapse-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 32px;
  margin-top: auto;
  color: var(--text-secondary);
  cursor: pointer;
  background: transparent;
  border: none;
  border-radius: 6px;
  transition: all 0.15s;

  &:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }
}

.settings-content {
  flex: 1;
  width: 0;
}
</style>
