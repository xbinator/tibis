<!--
  @file SessionHistory.vue
  @description 展示共享聊天会话集合，并处理切换、分页请求和删除交互。
-->
<template>
  <BDropdown v-model:open="open" :disabled="isDisabled" :align="{ offset: [-84, 0] }">
    <BButton square size="small" type="text" :disabled="isDisabled">
      <BIcon icon="lucide:history" :size="16" />
    </BButton>

    <template #overlay>
      <div class="session-history" @click.stop>
        <div v-if="chatStore.sessions.length || chatStore.sessionsLoading" ref="scrollContainer" class="session-history__list">
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

            <div v-if="chatStore.sessionsLoading" class="session-history__loading">
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
import type { ChatSession } from 'types/chat';
import { computed, ref } from 'vue';
import { useInfiniteScroll } from '@vueuse/core';
import { message } from 'ant-design-vue';
import dayjs from 'dayjs';
import { filter, groupBy, map } from 'lodash-es';
import BButton from '@/components/BButton/index.vue';
import BDropdown from '@/components/BDropdown/index.vue';
import { useChatSessionStore } from '@/stores/chat/session';
import { isActiveRuntimeStatus, useChatTabStore } from '@/stores/chat/tab';
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

const props = withDefaults(defineProps<Props>(), {
  activeSessionId: null,
  disabled: false
});

const open = ref(false);
const chatStore = useChatSessionStore();
/** 聊天标签运行时态存储，用于判断每个会话是否处于运行/等待等忙碌状态。 */
const runtimeStore = useChatTabStore();

/** 滚动容器引用 */
const scrollContainer = ref<HTMLElement>();

const emit = defineEmits<{
  (e: 'switch-session', sessionId: string): void;
  (e: 'delete-session', sessionId: string): void;
  (e: 'load-more'): void;
}>();

const isDisabled = computed(() => props.disabled);
/** 忙碌会话 ID 集合：从聊天标签运行时态直接推导，供删除按钮判断是否禁用。 */
const activeRuntimeIds = computed<Set<string>>((): Set<string> => {
  const busyRecords = filter(Object.values(runtimeStore.records), (record) => record.sessionId && isActiveRuntimeStatus(record.status));

  const busyIds = map(busyRecords, 'sessionId');

  return new Set(busyIds);
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
  const groups = groupBy(chatStore.sessions, (session: ChatSession) => toDateKey(session.lastMessageAt || session.updatedAt || session.createdAt || ''));

  return map(groups, (_sessions, key) => ({ key, label: formatSessionDay(_sessions[0].lastMessageAt), sessions: _sessions }));
});

/**
 * 使用 IntersectionObserver 监听滚动容器底部，触发加载更多
 */
useInfiniteScroll(
  scrollContainer,
  (): void => {
    emit('load-more');
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
  if (chatStore.sessionsLoading) return;
  if (activeRuntimeIds.value.has(sessionId)) return;

  const [error] = await asyncTo(chatStore.deleteSession(sessionId));

  if (!error) {
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
