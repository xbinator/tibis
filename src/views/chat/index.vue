<!--
  @file index.vue
  @description 独立聊天页宿主，协调 BChat、顶部标签与后台运行状态。
-->
<template>
  <div class="chat-page">
    <BChat
      ref="bChatRef"
      class="chat-container"
      :session-id="initialSessionId"
      @session-created="handleSessionCreated"
      @session-title-persisted="handleTitlePersisted"
      @new-session="openDraftSession"
      @runtime-status-change="handleRuntimeStatus"
      @runtime-completed="handleRuntimeCompleted"
      @navigate-to-provider="handleProviderNavigate"
    />
  </div>
</template>

<script setup lang="ts">
import type { ChatSession } from 'types/chat';
import { onActivated, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import BChat from '@/components/BChat/index.vue';
import { isBlockingNavigationFailure } from '@/router/navigation';
import { CHAT_DRAFT_TAB_ID, createChatPath, createChatTabId, findChatTab } from '@/router/routes/helpers/chatRouteTab';
import { normalizeRouteParam } from '@/router/routes/helpers/fileRouteTab';
import { useChatSessionStore } from '@/stores/chat/session';
import type { ChatTabRuntimeController, ChatTabSourceStatus } from '@/stores/chat/tabRuntime';
import { useChatTabRuntimeStore } from '@/stores/chat/tabRuntime';
import type { Tab } from '@/stores/workspace/tabs';
import { useTabsStore } from '@/stores/workspace/tabs';
import { asyncTo } from '@/utils/asyncTo';

/** BChat 对页面宿主暴露的组件实例。 */
type BChatInstance = InstanceType<typeof BChat>;

const route = useRoute();
/** 页面实例创建时捕获的不可变会话 ID，避免后台 KeepAlive 实例跟随全局路由变化。 */
const initialSessionId = normalizeRouteParam(route.params.sessionId) ?? null;
const router = useRouter();
const chatStore = useChatSessionStore();
const tabsStore = useTabsStore();
const runtimeStore = useChatTabRuntimeStore();
const bChatRef = ref<BChatInstance>();
/** 当前组件实例拥有的稳定标签 ID，草稿晋升时原位更新。 */
const ownerTabId = ref<string>(createChatTabId(initialSessionId));
/** 等待 Runtime 空闲后晋升的草稿会话。 */
const pendingSession = ref<ChatSession>();

/** 页面注册到运行态 Store 的终止控制器。 */
const runtimeController: ChatTabRuntimeController = {
  abort: async (): Promise<void> => {
    if (!bChatRef.value) throw new Error('聊天页面尚未准备完成');
    await bChatRef.value.abortRuntime();
  }
};

runtimeStore.ensureTab(ownerTabId.value, initialSessionId ?? undefined);

/**
 * 判断当前聊天标签是否处于活动路由。
 * @param tabId - 聊天标签 ID
 * @returns 是否为当前活动标签
 */
function isOwnerActive(tabId: string = ownerTabId.value): boolean {
  const owner = tabsStore.tabs.find((tab: Tab): boolean => tab.id === tabId);
  const ownerPath = owner?.path ?? (tabId === CHAT_DRAFT_TAB_ID ? createChatPath() : createChatPath(runtimeStore.records[tabId]?.sessionId));

  return route.path === ownerPath;
}

/** 标记当前活动聊天已被用户查看。 */
function markCurrentViewed(): void {
  if (isOwnerActive()) runtimeStore.markViewed(ownerTabId.value);
}

/**
 * 将唯一草稿标签原位晋升为持久化会话标签。
 * 路由失败时回滚标签和运行态归属，保留待晋升会话供下一次 idle 重试。
 */
async function promoteDraft(): Promise<void> {
  const session = pendingSession.value;
  if (!session || ownerTabId.value !== CHAT_DRAFT_TAB_ID) return;

  const sourceTab = findChatTab(tabsStore.tabs);
  if (!sourceTab) return;

  const targetTabId = createChatTabId(session.id);
  const targetPath = createChatPath(session.id);
  const targetTab: Tab = {
    id: targetTabId,
    path: targetPath,
    title: session.title,
    cacheKey: targetTabId,
    icon: sourceTab.icon ?? 'lucide:message-circle'
  };
  const wasActive = isOwnerActive(CHAT_DRAFT_TAB_ID);
  if (!tabsStore.replaceTab({ sourceId: CHAT_DRAFT_TAB_ID, tab: targetTab })) return;

  runtimeStore.promoteTab(CHAT_DRAFT_TAB_ID, targetTabId, session.id);
  ownerTabId.value = targetTabId;

  if (wasActive) {
    const [navigationError, navigationResult] = await asyncTo(router.replace(targetPath));
    if (navigationError || isBlockingNavigationFailure(navigationResult)) {
      tabsStore.replaceTab({ sourceId: targetTabId, tab: sourceTab });
      runtimeStore.promoteTab(targetTabId, CHAT_DRAFT_TAB_ID, session.id);
      ownerTabId.value = CHAT_DRAFT_TAB_ID;
      return;
    }
  }

  pendingSession.value = undefined;
}

/**
 * 处理 BChat 创建的会话。
 * 草稿页先绑定归属并等待 idle，持久化页面则把分支打开为新标签。
 * @param session - 新建或分支会话
 */
async function handleSessionCreated(session: ChatSession): Promise<void> {
  if (ownerTabId.value === CHAT_DRAFT_TAB_ID) {
    pendingSession.value = session;
    runtimeStore.bindSession(CHAT_DRAFT_TAB_ID, session.id);
    return;
  }

  await asyncTo(router.push(createChatPath(session.id)));
}

/**
 * 同步自动命名后的标签标题。
 * @param sessionId - 已更新会话 ID
 * @param title - 最新标题
 */
function handleTitlePersisted(sessionId: string, title: string): void {
  const owner = runtimeStore.findOwner(sessionId);
  const targetTabId = owner?.tabId ?? createChatTabId(sessionId);
  tabsStore.updateTabTitle({ id: targetTabId, title });
  if (pendingSession.value?.id === sessionId) pendingSession.value.title = title;
}

/** 打开或复用唯一空白聊天标签。 */
async function openDraftSession(): Promise<void> {
  if (ownerTabId.value === CHAT_DRAFT_TAB_ID && isOwnerActive()) {
    await asyncTo(bChatRef.value?.resetDraft() ?? Promise.resolve());
    return;
  }

  const draftTab = findChatTab(tabsStore.tabs);
  await asyncTo(router.push(draftTab?.path ?? createChatPath()));
}

/**
 * 同步 BChat 运行状态。
 * @param status - BChat 运行状态
 */
function handleRuntimeStatus(status: ChatTabSourceStatus): void {
  const tabId = ownerTabId.value;
  runtimeStore.setStatus(tabId, status);
  if (status === 'idle') asyncTo(promoteDraft());
}

/**
 * 标记一次 Runtime 成功完成。
 * @param sessionId - 完成的会话 ID
 */
function handleRuntimeCompleted(sessionId: string): void {
  const owner = runtimeStore.findOwner(sessionId);
  const tabId = owner?.tabId ?? ownerTabId.value;
  runtimeStore.markCompleted(tabId, isOwnerActive(tabId));
}

/** 导航到模型 Provider 设置页。 */
function handleProviderNavigate(): void {
  asyncTo(router.push('/settings/provider'));
}

watch(() => route.fullPath, markCurrentViewed, { immediate: true });
onActivated(markCurrentViewed);

onMounted((): void => {
  runtimeStore.registerController(ownerTabId.value, runtimeController);
  asyncTo(chatStore.ensureSessions());
});

onUnmounted((): void => {
  runtimeStore.unregisterController(ownerTabId.value, runtimeController);
});
</script>

<style scoped lang="less">
.chat-page {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
}

.chat-container {
  height: 100%;
}
</style>
