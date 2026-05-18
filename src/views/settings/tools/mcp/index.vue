<!--
  @file index.vue
  @description MCP 工具设置页，负责管理 MCP server 配置。
-->
<template>
  <BSettingsPage title="MCP">
    <template #headerExtra>
      <BButton type="primary" size="small" @click="handleOpenAddModal">添加</BButton>
    </template>
    <BSettingsSection title="MCP Servers">
      <div class="mcp-tools-settings__toolbar">
        <div class="mcp-tools-settings__hint">配置会保存为全局设置，聊天侧只消费默认启用项。</div>
      </div>

      <div v-if="store.mcp.servers.length === 0" class="mcp-tools-settings__empty">暂无 MCP server 配置。</div>

      <div v-for="server in store.mcp.servers" :key="server.id" class="mcp-tools-settings__server">
        <div class="mcp-tools-settings__server-row">
          <div class="mcp-tools-settings__server-icon">{{ server.name.charAt(0).toUpperCase() }}</div>
          <div class="mcp-tools-settings__server-info">
            <div class="mcp-tools-settings__server-name">{{ server.name }}</div>
            <div class="mcp-tools-settings__server-command">{{ server.command }} {{ server.args.join(' ') }}</div>
            <div v-if="getServerStatusSummary(server.id)" class="mcp-tools-settings__server-status">
              {{ getServerStatusSummary(server.id) }}
            </div>
            <div v-if="getServerStatusMessage(server.id)" class="mcp-tools-settings__server-status-message">
              {{ getServerStatusMessage(server.id) }}
            </div>
          </div>
          <div class="mcp-tools-settings__server-actions">
            <ASwitch :checked="server.enabled" size="small" @change="(value) => handleServerPatch(server.id, { enabled: Boolean(value) })" />
            <BDropdown placement="bottomRight">
              <button class="mcp-tools-settings__settings-btn">
                <Icon icon="lucide:settings" :width="16" />
              </button>
              <template #overlay>
                <BDropdownMenu :options="getServerDropdownOptions(server)" :width="120" />
              </template>
            </BDropdown>
          </div>
        </div>
      </div>
    </BSettingsSection>

    <ServerEditorModal v-model:open="addModalVisible" :server="editingServer" @cancel="handleCancelAdd" @confirm="handleConfirmAdd" />
  </BSettingsPage>
</template>

<script setup lang="ts">
import type { MCPServerEditorDraft } from './components/server-editor';
import type { MCPStatusResponse } from 'types/ai';
import { computed, onMounted, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { nanoid } from 'nanoid';
import BDropdown from '@/components/BDropdown/index.vue';
import BDropdownMenu from '@/components/BDropdown/Menu.vue';
import type { DropdownOption } from '@/components/BDropdown/type';
import { getElectronAPI, hasElectronAPI } from '@/shared/platform/electron-api';
import type { MCPServerConfig } from '@/shared/storage/tool-settings';
import { DEFAULT_MCP_CONNECT_TIMEOUT_MS, DEFAULT_MCP_TOOL_CALL_TIMEOUT_MS } from '@/shared/storage/tool-settings';
import { useToolSettingsStore } from '@/stores/ai/toolSettings';
import ServerEditorModal from './components/ServerEditorModal.vue';

const store = useToolSettingsStore();
const refreshingServerId = ref<string | null>(null);
const statusByServerId = ref<Record<string, MCPStatusResponse>>({});
const addModalVisible = ref(false);

/**
 * 当前编辑的 server ID，非空时为编辑模式。
 */
const editingServerId = ref<string | null>(null);

/**
 * 当前正在编辑的 server。
 */
const editingServer = computed<MCPServerConfig | null>(() => {
  if (!editingServerId.value) {
    return null;
  }

  return store.getMcpServerById(editingServerId.value) ?? null;
});

/**
 * 刷新当前页面展示的 MCP server 状态。
 */
async function refreshStatuses(): Promise<void> {
  if (!hasElectronAPI() || store.mcp.servers.length === 0) {
    statusByServerId.value = {};
    return;
  }

  const statuses = await getElectronAPI().getMcpStatus(store.mcp.servers.map((server) => server.id));
  statusByServerId.value = Object.fromEntries(statuses.map((status) => [status.serverId, status]));
}

/**
 * 读取指定 server 的状态。
 * @param serverId - MCP server ID
 * @returns server 运行状态
 */
function getServerStatus(serverId: string): MCPStatusResponse | null {
  return statusByServerId.value[serverId] ?? null;
}

/**
 * 生成 server 状态摘要文案。
 * @param serverId - MCP server ID
 * @returns 状态摘要
 */
function getServerStatusSummary(serverId: string): string {
  const status = getServerStatus(serverId);
  if (!status) {
    return '';
  }

  return `Sandbox: ${status.sandboxStatus} · Discovery: ${status.discoveryStatus}`;
}

/**
 * 读取 server 最新状态说明。
 * @param serverId - MCP server ID
 * @returns 状态说明
 */
function getServerStatusMessage(serverId: string): string {
  return getServerStatus(serverId)?.message ?? '';
}

/**
 * 请求异步刷新 server 状态，并在失败时静默保留当前页面状态。
 */
function requestStatusRefresh(): void {
  refreshStatuses().catch(() => {
    // 列表操作不应因状态轮询失败而打断。
  });
}

/**
 * 关闭弹窗并清理编辑态。
 */
function closeEditorModal(): void {
  addModalVisible.value = false;
  editingServerId.value = null;
}

/**
 * 打开添加 MCP server 的弹窗。
 */
function handleOpenAddModal(): void {
  editingServerId.value = null;
  addModalVisible.value = true;
}

/**
 * 打开编辑 MCP server 的弹窗。
 * @param server - MCP server 配置
 */
function handleEditServer(server: MCPServerConfig): void {
  editingServerId.value = server.id;
  addModalVisible.value = true;
}

/**
 * 取消添加/编辑操作，关闭弹窗。
 */
function handleCancelAdd(): void {
  closeEditorModal();
}

/**
 * 确认添加或编辑 MCP server。
 * @param draft - 编辑弹窗返回的 server 草稿
 */
function handleConfirmAdd(draft: MCPServerEditorDraft): void {
  if (editingServerId.value) {
    store.updateMcpServer(editingServerId.value, draft);
  } else {
    const server: MCPServerConfig = {
      ...draft,
      id: nanoid(),
      enabled: false,
      transport: 'stdio',
      connectTimeoutMs: DEFAULT_MCP_CONNECT_TIMEOUT_MS,
      toolCallTimeoutMs: draft.toolCallTimeoutMs ?? DEFAULT_MCP_TOOL_CALL_TIMEOUT_MS
    };
    store.addMcpServer(server);
  }
  closeEditorModal();
  requestStatusRefresh();
}

/**
 * 更新 MCP server。
 * @param serverId - MCP server ID
 * @param patch - 更新字段
 */
function handleServerPatch(serverId: string, patch: Partial<MCPServerConfig>): void {
  store.updateMcpServer(serverId, patch);
  requestStatusRefresh();
}

/**
 * 删除 MCP server。
 * @param serverId - MCP server ID
 */
function handleRemoveServer(serverId: string): void {
  store.removeMcpServer(serverId);
  const nextStatuses = { ...statusByServerId.value };
  delete nextStatuses[serverId];
  statusByServerId.value = nextStatuses;
}

/**
 * 触发指定 server 的 discovery 刷新。
 * @param server - MCP server 配置
 */
async function handleRefreshDiscovery(server: MCPServerConfig): Promise<void> {
  if (!hasElectronAPI()) {
    statusByServerId.value = {
      ...statusByServerId.value,
      [server.id]: {
        serverId: server.id,
        sandboxStatus: 'failed',
        discoveryStatus: 'failed',
        message: 'Electron API is not available'
      }
    };
    return;
  }

  refreshingServerId.value = server.id;
  try {
    await getElectronAPI().refreshMcpDiscovery(server);
    await refreshStatuses();
  } finally {
    refreshingServerId.value = null;
  }
}

/**
 * 生成指定 server 的下拉菜单选项。
 * @param server - MCP server 配置
 * @returns 下拉菜单选项
 */
function getServerDropdownOptions(server: MCPServerConfig): DropdownOption[] {
  return [
    {
      type: 'item',
      value: 'edit',
      label: '编辑',
      icon: 'lucide:pencil',
      onClick: () => handleEditServer(server)
    },
    {
      type: 'item',
      value: 'restart',
      label: refreshingServerId.value === server.id ? '重启中…' : '重启',
      icon: 'lucide:refresh-cw',
      disabled: refreshingServerId.value === server.id,
      onClick: () => handleRefreshDiscovery(server)
    },
    {
      type: 'divider'
    },
    {
      type: 'item',
      value: 'delete',
      label: '删除',
      icon: 'lucide:trash-2',
      danger: true,
      onClick: () => handleRemoveServer(server.id)
    }
  ];
}

onMounted(refreshStatuses);
</script>

<style scoped lang="less">
.mcp-tools-settings__toolbar {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
}

.mcp-tools-settings__hint,
.mcp-tools-settings__empty,
.mcp-tools-settings__description {
  font-size: 12px;
  color: var(--text-secondary);
}

.mcp-tools-settings__empty {
  padding: 16px;
}

.mcp-tools-settings__server {
  padding: 12px 16px;
  border-top: 1px solid var(--border-tertiary);
}

.mcp-tools-settings__server-row {
  display: flex;
  gap: 12px;
  align-items: center;
}

.mcp-tools-settings__server-icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  background: var(--bg-tertiary);
  border-radius: 6px;
}

.mcp-tools-settings__server-info {
  flex: 1;
  min-width: 0;
}

.mcp-tools-settings__server-name {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
}

.mcp-tools-settings__server-command {
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  color: var(--text-tertiary);
  white-space: nowrap;
}

.mcp-tools-settings__server-status,
.mcp-tools-settings__server-status-message {
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-secondary);
}

.mcp-tools-settings__server-status-message {
  color: var(--text-tertiary);
}

.mcp-tools-settings__server-actions {
  display: flex;
  flex-shrink: 0;
  gap: 8px;
  align-items: center;
}

.mcp-tools-settings__settings-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  color: var(--text-secondary);
  cursor: pointer;
  background: none;
  border: none;
  border-radius: 4px;
  transition: background 0.2s, color 0.2s;

  &:hover {
    color: var(--text-primary);
    background: var(--bg-tertiary);
  }
}
</style>
