<!--
  @file ChatSider.vue
  @description 默认布局聊天侧栏壳，负责侧栏尺寸、标题、会话历史和显示状态。
-->
<template>
  <BPanelSplitter
    v-show="settingStore.sidebarVisible"
    v-model:size="settingStore.sidebarWidth"
    :class="bem({ expanded: isSidebarExpanded })"
    :disabled="isSidebarExpanded"
    position="left"
    :min-width="340"
    max-width="40%"
    @close="handleClose"
  >
    <div :class="bem('content')">
      <div :class="bem('header')">
        <div :class="[bem('title'), 'truncate']">{{ currentTitle }}</div>
        <BButton data-testid="chat-new-session-button" square size="small" type="text" :disabled="isSessionActionDisabled" @click="handleCreateDraftSession">
          <BIcon icon="lucide:message-circle-plus" :size="16" />
        </BButton>

        <SessionHistory
          ref="sessionHistoryRef"
          v-model:current-session="currentSession"
          :active-session-id="settingStore.chatSidebarActiveSessionId"
          :disabled="isSessionActionDisabled"
          @switch-session="handleSwitchSession"
          @delete-session="handleDeletedSession"
        />
        <BButton data-testid="chat-expand-button" square size="small" :type="isSidebarExpanded ? 'secondary' : 'text'" @click="toggleSidebarExpanded">
          <BIcon icon="lucide:maximize" :size="16" />
        </BButton>

        <div :class="bem('divider')"></div>
        <BButton data-testid="chat-close-button" square size="small" type="text" @click="handleClose">
          <BIcon icon="lucide:x" :size="16" />
        </BButton>
      </div>

      <BChat
        :session-id="settingStore.chatSidebarActiveSessionId"
        @draft-session-created="handleCreateDraftSession"
        @session-created="handleSessionCreated"
        @session-title-persisted="handleSessionTitlePersisted"
        @loading-change="handleChatLoadingChange"
        @navigate-to-provider="handleNavigateToProvider"
      />
    </div>
  </BPanelSplitter>
</template>

<script setup lang="ts">
import type { ChatSession } from 'types/chat';
import { computed, onUnmounted, ref, watch } from 'vue';
import BButton from '@/components/BButton/index.vue';
import SessionHistory from '@/components/BChat/components/SessionHistory.vue';
import BChat from '@/components/BChat/index.vue';
import { useSettingStore } from '@/stores/ui/setting';
import { createNamespace } from '@/utils/namespace';
import { useChatSession } from '../hooks/useChatSession';

const [, bem] = createNamespace('chat-sider', '');

/** 应用设置存储。 */
const settingStore = useSettingStore();
/** 聊天运行时是否忙碌。 */
const chatLoading = ref(false);

const {
  currentSession,
  loading: sessionLoading,
  switchSession,
  createDraftSession,
  handleDeletedSession,
  setCurrentSession
} = useChatSession({
  isChatLoading: () => chatLoading.value
});

/** 会话历史组件实例引用。 */
const sessionHistoryRef = ref<InstanceType<typeof SessionHistory>>();
/** 聊天侧栏是否处于放大覆盖状态。 */
const isSidebarExpanded = computed<boolean>(() => settingStore.chatSidebarExpanded);
/** 当前标题。 */
const currentTitle = computed<string>(() => currentSession.value?.title || '新会话');
/** 是否禁用会话切换、新会话和删除操作。 */
const isSessionActionDisabled = computed<boolean>(() => chatLoading.value || sessionLoading.value);

/**
 * 切换聊天侧栏放大状态。
 */
function toggleSidebarExpanded(): void {
  settingStore.toggleChatSidebarExpanded();
}

/**
 * 关闭聊天侧栏。
 */
function handleClose(): void {
  settingStore.setSidebarVisible(false);
  settingStore.setChatSidebarExpanded(false);
}

/**
 * 进入新会话草稿态。
 */
async function handleCreateDraftSession(): Promise<void> {
  await createDraftSession();
}

/**
 * 切换当前会话。
 * @param sessionId - 目标会话 ID
 */
async function handleSwitchSession(sessionId: string): Promise<void> {
  await switchSession(sessionId);
}

/**
 * 同步 BChat 内部创建的新会话。
 * @param session - 新创建的会话对象
 */
async function handleSessionCreated(session: ChatSession): Promise<void> {
  settingStore.setChatSidebarActiveSessionId(session.id);
  setCurrentSession(session);
  await sessionHistoryRef.value?.refreshSessions();
}

/**
 * 同步 BChat 自动命名后持久化的会话标题。
 * @param sessionId - 已更新标题的会话 ID
 * @param title - 自动生成后的会话标题
 */
async function handleSessionTitlePersisted(sessionId: string, title: string): Promise<void> {
  if (currentSession.value?.id === sessionId) {
    setCurrentSession({ ...currentSession.value, title });
  }

  await sessionHistoryRef.value?.refreshSessions();
}

/**
 * 同步聊天运行时状态。
 * @param loading - 是否存在正在运行的聊天、压缩或流式任务
 */
function handleChatLoadingChange(loading: boolean): void {
  chatLoading.value = loading;
}

/**
 * 处理导航到配置页事件，展开状态下先关闭侧栏。
 */
function handleNavigateToProvider(): void {
  if (isSidebarExpanded.value) {
    settingStore.setChatSidebarExpanded(false);
  }
}

watch(
  () => settingStore.sidebarVisible,
  (visible) => {
    if (!visible) {
      settingStore.setChatSidebarExpanded(false);
    }
  }
);

onUnmounted(() => {
  settingStore.setChatSidebarExpanded(false);
});
</script>

<style lang="less">
.chat-sider--expanded {
  position: absolute;
  inset: 0;
  z-index: 2;
  width: 100%;
  height: 100%;
}

.chat-sider--expanded .b-panel-splitter__section {
  width: 100% !important;
}

.chat-sider__content {
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--bg-primary);
  border-radius: 8px;
}

.chat-sider__header {
  display: flex;
  gap: 8px;
  align-items: center;
  height: 40px;
  padding: 0 8px 0 12px;
  border-bottom: 1px solid var(--border-primary);
}

.chat-sider__title {
  flex: 1;
  width: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

.chat-sider__divider {
  width: 1px;
  height: 16px;
  background-color: var(--border-secondary);
}
</style>
