/**
 * @file index.test.ts
 * @description 验证 MCP 工具设置页的状态渲染与编辑保存行为。
 */
/* @vitest-environment jsdom */

import { defineComponent } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MCPServerConfig } from '@/shared/storage/tool-settings';
import { useToolSettingsStore } from '@/stores/ai/toolSettings';

const storage = new Map<string, string>();

const electronMocks = vi.hoisted(() => ({
  hasElectronAPI: vi.fn(() => true),
  getMcpStatus: vi.fn(),
  refreshMcpDiscovery: vi.fn(),
  restartMcpServer: vi.fn()
}));

vi.mock('@/shared/platform/electron-api', () => ({
  hasElectronAPI: electronMocks.hasElectronAPI,
  getElectronAPI: () => ({
    getMcpStatus: electronMocks.getMcpStatus,
    refreshMcpDiscovery: electronMocks.refreshMcpDiscovery,
    restartMcpServer: electronMocks.restartMcpServer
  })
}));

vi.mock('@/components/BDropdown/index.vue', () => ({
  default: defineComponent({
    /**
     * 下拉容器测试桩。
     */
    name: 'BDropdownStub',
    template: '<div><slot /><slot name="overlay" /></div>'
  })
}));

vi.mock('@/components/BDropdown/Menu.vue', () => ({
  default: defineComponent({
    /**
     * 下拉菜单测试桩。
     */
    name: 'BDropdownMenuStub',
    props: {
      options: {
        type: Array,
        required: true
      }
    },
    template: '<div class="dropdown-menu-stub">{{ (options || []).length }}</div>'
  })
}));

vi.stubGlobal('localStorage', {
  getItem(key: string): string | null {
    return storage.get(key) ?? null;
  },
  setItem(key: string, value: string): void {
    storage.set(key, value);
  },
  removeItem(key: string): void {
    storage.delete(key);
  },
  clear(): void {
    storage.clear();
  }
});

/**
 * 创建基础 MCP server 配置。
 * @param patch - 需要覆盖的字段
 * @returns MCP server 配置
 */
function createServer(patch: Partial<MCPServerConfig> = {}): MCPServerConfig {
  return {
    id: 'server-1',
    name: 'Filesystem',
    enabled: true,
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem'],
    env: {},
    toolAllowlist: ['read_file'],
    connectTimeoutMs: 45000,
    toolCallTimeoutMs: 30000,
    ...patch
  };
}

/**
 * 创建页面挂载所需的通用桩组件。
 * @returns 挂载配置
 */
function createGlobalStubs() {
  return {
    BSettingsPage: { template: '<div><slot name="headerExtra" /><slot /></div>', props: ['title'] },
    BSettingsSection: { template: '<section><slot /></section>', props: ['title'] },
    BButton: { template: '<button @click="$emit(\'click\')"><slot /></button>' },
    ASwitch: { template: '<input type="checkbox" :checked="checked" />', props: ['checked'] },
    BDropdown: { template: '<div><slot /><slot name="overlay" /></div>' },
    BDropdownMenu: defineComponent({
      /**
       * 下拉菜单测试桩。
       */
      name: 'BDropdownMenuStub',
      props: {
        options: {
          type: Array,
          required: true
        }
      },
      methods: {
        /**
         * 触发菜单项点击回调。
         * @param option - 当前菜单项
         */
        handleOptionClick(option: { onClick?: () => void }): void {
          option.onClick?.();
        }
      },
      template: `
        <div class="dropdown-menu-stub">
          <button
            v-for="option in (options || []).filter((item) => item.type === 'item')"
            :key="option.value"
            class="dropdown-option-stub"
            @click="handleOptionClick(option)"
          >
            {{ option.label }}
          </button>
        </div>
      `
    }),
    Icon: { template: '<i />', props: ['icon', 'width'] },
    ServerEditorModal: defineComponent({
      /**
       * MCP Server 编辑弹窗测试桩。
       */
      name: 'ServerEditorModalStub',
      props: {
        open: {
          type: Boolean,
          default: false
        },
        server: {
          type: Object,
          default: null
        }
      },
      emits: ['update:open', 'confirm', 'cancel'],
      template: '<div class="server-editor-modal-stub"></div>'
    })
  };
}

describe('MCPToolsSettingsView', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    electronMocks.hasElectronAPI.mockReturnValue(true);
    electronMocks.getMcpStatus.mockResolvedValue([]);
    electronMocks.refreshMcpDiscovery.mockResolvedValue({ ok: true });
    electronMocks.restartMcpServer.mockResolvedValue({ ok: true });
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('renders MCP runtime status and latest message', async () => {
    const { default: MCPToolsSettingsView } = await import('@/views/settings/tools/mcp/index.vue');
    const store = useToolSettingsStore();
    store.addMcpServer(createServer());
    electronMocks.getMcpStatus.mockResolvedValue([
      {
        serverId: 'server-1',
        sandboxStatus: 'running',
        discoveryStatus: 'ready',
        message: '3 tools discovered'
      }
    ]);

    const wrapper = mount(MCPToolsSettingsView, {
      global: {
        stubs: createGlobalStubs()
      }
    });

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(wrapper.text()).toContain('Sandbox: running');
    expect(wrapper.text()).toContain('Discovery: ready');
    expect(wrapper.text()).toContain('3 tools discovered');
  });

  it('preserves server-level fields when saving an edited server', async () => {
    const { default: MCPToolsSettingsView } = await import('@/views/settings/tools/mcp/index.vue');
    const store = useToolSettingsStore();
    store.addMcpServer(createServer());

    const wrapper = mount(MCPToolsSettingsView, {
      global: {
        stubs: createGlobalStubs()
      }
    });

    const editButton = wrapper.findAll('button').find((button) => button.text() === '编辑');
    expect(editButton).toBeDefined();
    await editButton!.trigger('click');

    const modal = wrapper.getComponent({ name: 'ServerEditorModalStub' });
    await modal.vm.$emit('confirm', {
      name: 'Filesystem Updated',
      command: 'uvx',
      args: ['mcp-server-filesystem'],
      env: { ROOT: '/tmp' },
      toolAllowlist: ['list_directory'],
      toolCallTimeoutMs: 15000
    });

    expect(store.getMcpServerById('server-1')).toMatchObject({
      id: 'server-1',
      name: 'Filesystem Updated',
      enabled: true,
      connectTimeoutMs: 45000,
      toolCallTimeoutMs: 15000,
      command: 'uvx',
      args: ['mcp-server-filesystem']
    });
  });

  it('restarts a server through MCP runtime IPC from the dropdown action', async () => {
    const { default: MCPToolsSettingsView } = await import('@/views/settings/tools/mcp/index.vue');
    const store = useToolSettingsStore();
    const server = createServer();
    store.addMcpServer(server);

    const wrapper = mount(MCPToolsSettingsView, {
      global: {
        stubs: createGlobalStubs()
      }
    });

    const restartButton = wrapper.findAll('button').find((button) => button.text() === '重启');
    expect(restartButton).toBeDefined();
    await restartButton!.trigger('click');
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(electronMocks.restartMcpServer).toHaveBeenCalledWith(expect.objectContaining({ id: server.id, command: server.command }));
    expect(electronMocks.refreshMcpDiscovery).not.toHaveBeenCalled();
  });

  it('records a failed runtime status when restart is requested without Electron API', async () => {
    const { default: MCPToolsSettingsView } = await import('@/views/settings/tools/mcp/index.vue');
    const store = useToolSettingsStore();
    store.addMcpServer(createServer());
    electronMocks.hasElectronAPI.mockReturnValue(false);

    const wrapper = mount(MCPToolsSettingsView, {
      global: {
        stubs: createGlobalStubs()
      }
    });

    const restartButton = wrapper.findAll('button').find((button) => button.text() === '重启');
    expect(restartButton).toBeDefined();
    await restartButton!.trigger('click');

    expect(wrapper.text()).toContain('Runtime: failed');
    expect(wrapper.text()).toContain('Electron API is not available');
  });
});
