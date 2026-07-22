<template>
  <BDropdown v-model:open="open" :disabled="isDisabled" :align="{ offset: [-84, 0] }">
    <BButton square size="small" type="text" :disabled="isDisabled">
      <BIcon icon="lucide:history" :size="16" />
    </BButton>

    <template #overlay>
      <div class="session-history" @click.stop>
        <div v-if="displayedSessions.length || loading" ref="scrollContainer" class="session-history__list">
          <div class="session-history__list-inner">
            <template v-for="group in groupedSessions" :key="group.key">
              <div class="session-history__group-title">
                {{ group.label }}
              </div>
              <div
                v-for="session in group.sessions"
                :key="session.id"
                class="session-history__item"
                :class="{ 'is-active': session.id === props.activeSessionId }"
                @click="handleSwitchSession(session.id)"
              >
                <span class="session-history__content">
                  <span class="session-history__item-title">{{ session.title }}</span>
                </span>
                <span class="session-history__actions">
                  <BButton type="text" square danger size="small" :disabled="activeRuntimeIds.has(session.id)" @click.stop="handleDeleteSession(session.id)">
                    <BIcon icon="lucide:trash-2" :size="14" />
                  </BButton>
                </span>
              </div>
            </template>

            <div v-if="loading" class="session-history__loading">
              <BIcon icon="lucide:loader-2" :size="14" class="is-spinning" />
              <span>加载中...</span>
            </div>
          </div>
        </div>

        <div v-else class="session-history__empty">暂无历史会话</div>
      </div>
    </template>
  </BDropdown>
</template>

<script setup lang="ts">
import type { ChatSession, SessionCursor, SessionPaginationParams } from 'types/chat';
import { computed, onMounted, ref, watch } from 'vue';
import { useInfiniteScroll } from '@vueuse/core';
import { message } from 'ant-design-vue';
import dayjs from 'dayjs';
import { filter, groupBy, map } from 'lodash-es';
import BButton from '@/components/BButton/index.vue';
import BDropdown from '@/components/BDropdown/index.vue';
import { useChatSessionStore } from '@/stores/chat/session';
import { isActiveRuntimeStatus, useChatTabRuntimeStore } from '@/stores/chat/tabRuntime';
import { asyncTo } from '@/utils/asyncTo';

/**
 * 组件 Props 定义
 */
interface Props {
  /** 当前选中的会话 ID */
  activeSessionId?: string | null;

  /** 是否禁用历史会话操作 */
  disabled?: boolean;
}

/**
 * 会话分组结构
 */
interface SessionGroup {
  /** 分组日期键 */
  key: string;
  /** 分组显示标签 */
  label: string;
  /** 该分组下的会话列表 */
  sessions: ChatSession[];
}

const CHAT_SESSION_TYPE = 'assistant';

/** 每页加载数量 */
const PAGE_SIZE = 20;

const props = withDefaults(defineProps<Props>(), {
  activeSessionId: null,
  disabled: false
});

const open = ref(false);
const chatStore = useChatSessionStore();
/** 聊天标签运行时态存储，用于判断每个会话是否处于运行/等待等忙碌状态。 */
const runtimeStore = useChatTabRuntimeStore();

/** 已加载的会话列表（增量累加） */
const displayedSessions = ref<ChatSession[]>([]);

/** 下一页游标 */
const nextCursor = ref<SessionCursor>();

/** 是否还有更多数据可加载 */
const hasMore = ref(true);

/** 加载状态 */
const loading = ref(false);

/** 滚动容器引用 */
const scrollContainer = ref<HTMLElement>();

const emit = defineEmits<{
  (e: 'switch-session', sessionId: string): void;
  (e: 'delete-session', sessionId: string): void;
  (e: 'update:currentSession', session: ChatSession | undefined): void;
}>();

/** 当前选中的会话对象 */
const currentSession = computed<ChatSession | undefined>(() => {
  if (!props.activeSessionId) return undefined;
  return displayedSessions.value.find((s) => s.id === props.activeSessionId);
});

const isDisabled = computed(() => props.disabled);
/** 忙碌会话 ID 集合：从聊天标签运行时态直接推导，供删除按钮判断是否禁用。 */
const activeRuntimeIds = computed<Set<string>>((): Set<string> => {
  const busyRecords = filter(Object.values(runtimeStore.records), (record) => record.sessionId && isActiveRuntimeStatus(record.status));

  const busyIds = map(busyRecords, 'sessionId');

  return new Set(busyIds);
});

/**
 * 加载会话数据
 * @param isRefresh - 是否为刷新操作（重置列表并从第一页加载）
 */
async function loadSessions(isRefresh = false): Promise<void> {
  if (loading.value) return;
  if (!isRefresh && !hasMore.value) return;

  loading.value = true;

  try {
    const pagination: SessionPaginationParams = {
      limit: PAGE_SIZE,
      cursor: isRefresh ? undefined : nextCursor.value
    };

    const result = await chatStore.getSessions(CHAT_SESSION_TYPE, pagination);

    if (isRefresh) {
      displayedSessions.value = result.items;
    } else {
      displayedSessions.value.push(...result.items);
    }

    nextCursor.value = result.nextCursor;
    hasMore.value = result.hasMore;

    emit('update:currentSession', currentSession.value);
  } catch {
    message.error('加载会话失败');
  } finally {
    loading.value = false;
  }
}

/**
 * 刷新会话列表（从第一页重新加载）
 */
async function refreshSessions(): Promise<void> {
  hasMore.value = true;
  nextCursor.value = undefined;
  await loadSessions(true);
}

/**
 * 监听 activeSessionId 变化，如果切换到不在当前列表中的会话则刷新列表
 */
watch(
  () => props.activeSessionId,
  async (newId, oldId) => {
    if (newId && newId !== oldId) {
      const exists = displayedSessions.value.some((s) => s.id === newId);
      if (!exists) {
        await refreshSessions();
      }
    }

    emit('update:currentSession', currentSession.value);
  },
  { immediate: true }
);

onMounted(async () => {
  await loadSessions(true);
});

/** 暴露刷新方法供父组件调用 */
defineExpose({
  refreshSessions
});

/**
 * 将时间戳转换为日期键（YYYY-MM-DD 格式）
 * @param timestamp - ISO 时间戳字符串
 * @returns 日期键
 */
function toDateKey(timestamp: string): string {
  return dayjs(timestamp).format('YYYY-MM-DD');
}

/**
 * 格式化会话日期为可读标签
 * @param timestamp - ISO 时间戳字符串
 * @returns 格式化后的日期标签（今天/昨天/MM-DD）
 */
function formatSessionDay(timestamp: string): string {
  const date = dayjs(timestamp);
  const now = dayjs();

  if (date.isSame(now, 'day')) return '今天';

  const yesterday = now.subtract(1, 'day');
  if (date.isSame(yesterday, 'day')) return '昨天';

  return date.format('MM-DD');
}

/** 按日期分组的会话列表 */
const groupedSessions = computed<SessionGroup[]>(() => {
  const groups = groupBy(displayedSessions.value, (session) => toDateKey(session.lastMessageAt || session.updatedAt || session.createdAt || ''));

  return map(groups, (_sessions, key) => ({ key, label: formatSessionDay(_sessions[0].lastMessageAt), sessions: _sessions }));
});

/**
 * 使用 IntersectionObserver 监听滚动容器底部，触发加载更多
 */
useInfiniteScroll(
  scrollContainer,
  () => {
    loadSessions();
  },
  { distance: 50 }
);

/**
 * 切换到指定会话
 * @param sessionId - 目标会话 ID
 */
function handleSwitchSession(sessionId: string): void {
  if (props.disabled) return;
  if (sessionId === props.activeSessionId) return;

  open.value = false;

  emit('switch-session', sessionId);
}

/**
 * 删除指定会话，保持当前分页状态不变
 * @param sessionId - 要删除的会话 ID
 */
async function handleDeleteSession(sessionId: string): Promise<void> {
  if (props.disabled) return;
  if (loading.value) return;
  if (activeRuntimeIds.value.has(sessionId)) return;

  loading.value = true;
  const [error] = await asyncTo(chatStore.deleteSession(sessionId));
  loading.value = false;

  if (!error) {
    // 从已加载列表中移除被删除的会话，保持分页状态
    displayedSessions.value = displayedSessions.value.filter((s) => s.id !== sessionId);

    // 更新游标为当前列表最后一条数据的时间戳
    if (displayedSessions.value.length > 0) {
      const lastItem = displayedSessions.value[displayedSessions.value.length - 1];
      nextCursor.value = {
        lastMessageAt: lastItem.lastMessageAt,
        createdAt: lastItem.createdAt
      };
    } else {
      // 列表清空后重置游标
      nextCursor.value = undefined;
    }

    // 如果当前列表已空且还有更多数据，加载下一页
    if (displayedSessions.value.length === 0 && hasMore.value) {
      await loadSessions(true);
    }

    emit('delete-session', sessionId);
  } else {
    message.error(error.message || '删除会话失败，请重试');
  }
}
</script>

<style scoped lang="less">
.session-history {
  width: 200px;
  padding: 6px;
  background: var(--dropdown-bg);
  border-radius: 8px;
  box-shadow: var(--shadow-dropdown);
}

.session-history__list {
  max-height: 260px;
  overflow-y: auto;
}

.session-history__list-inner {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.session-history__group-title {
  padding: 2px 8px;
  font-size: 12px;
  color: var(--text-secondary);
}

.session-history__item {
  display: flex;
  gap: 2px;
  align-items: center;
  width: 100%;
  min-height: 32px;
  padding: 0 8px;
  text-align: left;
  cursor: pointer;
  border: none;
  border-radius: 8px;
  transition: background 0.2s ease;

  &:hover,
  &.is-active {
    background: var(--dropdown-item-hover-bg);
  }
}

.session-history__content {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.session-history__item-title {
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-primary);
  white-space: nowrap;
}

.session-history__actions {
  display: none;
  flex-shrink: 0;
  gap: 4px;
  transition: opacity 0.2s ease;
}

.session-history__item:hover .session-history__actions {
  display: flex;
}

.session-history__loading {
  display: flex;
  gap: 4px;
  align-items: center;
  justify-content: center;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--text-secondary);
}

.session-history__no-more {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--text-tertiary, var(--text-secondary));
  text-align: center;
}

.session-history__empty {
  padding: 20px 12px;
  font-size: 12px;
  color: var(--text-secondary);
  text-align: center;
}

.is-spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}
</style>
