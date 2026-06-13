/**
 * @file sidebar-expand.test.ts
 * @description BChatSidebar 放大按钮交互测试。
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { createPinia, setActivePinia } from 'pinia';
import { shallowMount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BChatSidebar from '@/components/BChatSidebar/index.vue';
import { useSettingStore } from '@/stores/ui/setting';

const chatSidebarSource = readFileSync(`${process.cwd()}/src/components/BChatSidebar/index.vue`, 'utf8');

vi.mock('vue-router', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn()
  }))
}));

vi.mock('@/ai/tools/builtin', () => ({
  createBuiltinTools: vi.fn(() => []),
  isBuiltinToolName: vi.fn(() => true),
  READ_CURRENT_WEBPAGE_TOOL_NAME: 'read_current_webpage',
  READ_DIRECTORY_TOOL_NAME: 'read_directory',
  SKILL_TOOL_NAME: 'skill'
}));

vi.mock('@/ai/tools/builtin/SkillTool', () => ({
  createSkillTool: vi.fn()
}));

vi.mock('@/components/BButton/index.vue', () => ({
  default: {
    props: ['disabled'],
    template: '<button v-bind="$attrs" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'
  }
}));

vi.mock('@/utils/modal', () => ({
  Modal: {
    confirm: vi.fn()
  }
}));

vi.mock('@/shared/platform', () => ({
  native: {
    onShellCommandOutput: vi.fn(() => vi.fn()),
    openExternal: vi.fn(),
    getHomeDir: vi.fn(() => '/Users/test'),
    readFile: vi.fn(() => ({ content: '' })),
    readWorkspaceDirectory: vi.fn(() => []),
    getPathStatus: vi.fn(),
    trashFile: vi.fn(),
    watchDirectory: vi.fn(),
    unwatchDirectory: vi.fn(),
    onSkillChanged: vi.fn(() => vi.fn())
  }
}));

vi.mock('@/shared/platform/electron-api', () => ({
  getElectronAPI: vi.fn(() => ({
    chatCompressionUpdateStatus: vi.fn()
  })),
  unwrap: vi.fn((value: unknown) => value)
}));

vi.mock('@/hooks/useChat', () => ({
  useChat: vi.fn(() => ({
    agent: {
      stream: vi.fn(),
      abort: vi.fn(),
      invoke: vi.fn()
    }
  }))
}));

vi.mock('@/hooks/useWorkspaceRoot', () => ({
  useWorkspaceRoot: vi.fn(() => ({
    workspaceRoot: { value: '/workspace' },
    getWorkspaceRoot: vi.fn(() => '/workspace')
  }))
}));

vi.mock('@/hooks/useNavigate', () => ({
  useNavigate: vi.fn(() => ({
    openFile: vi.fn(),
    openWebview: vi.fn()
  }))
}));

vi.mock('@/hooks/useOpenFile', () => ({
  useOpenFile: vi.fn(() => ({
    openFileByPath: vi.fn()
  }))
}));

vi.mock('@/hooks/useOpenDraft', () => ({
  useOpenDraft: vi.fn(() => ({
    openDraft: vi.fn()
  }))
}));

vi.mock('@/stores/workspace/files', () => ({
  useFilesStore: vi.fn(() => ({
    recentFiles: [],
    ensureLoaded: vi.fn(),
    getFileByPath: vi.fn()
  }))
}));

vi.mock('@/stores/chat/session', () => ({
  useChatSessionStore: vi.fn(() => ({
    createSession: vi.fn(),
    addSessionMessage: vi.fn(),
    updateSessionMessage: vi.fn(),
    setSessionMessages: vi.fn(),
    getSessionMessages: vi.fn(() => []),
    getSessions: vi.fn(() => ({ items: [] }))
  }))
}));

vi.mock('@/stores/chat/todo', () => ({
  useTodoStore: vi.fn(() => ({
    getTodos: vi.fn(() => [])
  }))
}));

vi.mock('@/stores/ai/serviceModel', () => ({
  useServiceModelStore: vi.fn(() => ({
    chatModel: { providerId: 'provider-1', modelId: 'model-1' },
    getAvailableServiceConfig: vi.fn(),
    loadChatModel: vi.fn(),
    setChatModel: vi.fn()
  }))
}));

vi.mock('@/stores/ai/provider', () => ({
  useProviderStore: vi.fn(() => ({
    providers: [
      {
        id: 'provider-1',
        models: [{ id: 'model-1', supportsVision: false, contextWindow: 200000 }]
      }
    ]
  }))
}));

vi.mock('@/stores/ai/toolSettings', () => ({
  useToolSettingsStore: vi.fn(() => ({
    tavily: undefined,
    mcp: {
      servers: []
    }
  }))
}));

vi.mock('@/stores/ai/skill', () => ({
  useSkillStore: vi.fn(() => ({
    initialized: false,
    getEnabledSkills: vi.fn(() => []),
    init: vi.fn(),
    handleSkillChange: vi.fn()
  }))
}));

/**
 * 挂载聊天侧边栏组件。
 * @returns 组件测试包装器。
 */
function mountSidebar(): ReturnType<typeof shallowMount> {
  return shallowMount(BChatSidebar, {
    global: {
      stubs: {
        BButton: {
          props: ['disabled'],
          emits: ['click'],
          template: '<button v-bind="$attrs" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'
        },
        BIcon: true,
        BPanelSplitter: {
          props: ['sectionClass', 'disabled'],
          template: '<div class="b-panel-splitter" :class="$attrs.class"><div class="b-panel-splitter__section" :class="sectionClass"><slot /></div></div>'
        },
        BPromptEditor: true,
        BModelSelect: true,
        ConfirmationSheet: true,
        ConversationView: true,
        ImagePreview: true,
        InputToolbar: true,
        InteractionContainer: true,
        SessionHistory: true,
        TodoPanel: true,
        UsagePanel: true
      }
    }
  });
}

describe('BChatSidebar expand mode', () => {
  beforeEach((): void => {
    setActivePinia(createPinia());
    useSettingStore().setSidebarVisible(true);
  });

  it('toggles an active fullscreen content mode from the header button', async (): Promise<void> => {
    const wrapper = mountSidebar();
    const button = wrapper.find('[data-testid="chat-sidebar-expand-button"]');

    expect(button.exists()).toBe(true);
    expect(button.attributes('aria-pressed')).toBe('false');
    expect(button.find('b-icon-stub').attributes('icon')).toBe('lucide:maximize');
    expect(wrapper.find('.b-panel-splitter').classes()).not.toContain('b-chat-sidebar-splitter--expanded');

    await button.trigger('click');

    const activeButton = wrapper.find('[data-testid="chat-sidebar-expand-button"]');
    expect(activeButton.attributes('aria-pressed')).toBe('true');
    expect(activeButton.find('b-icon-stub').attributes('icon')).toBe('lucide:maximize');
    expect(activeButton.classes()).toContain('is-active');
    expect(wrapper.find('.b-panel-splitter').classes()).toContain('b-chat-sidebar-splitter--expanded');
    expect(wrapper.find('.b-panel-splitter__section').classes()).toContain('b-chat-sidebar-splitter__section--expanded');
  });

  it('keeps expanded sidebar above high z-index route overlays', (): void => {
    const expandedRule = chatSidebarSource.match(/\.b-panel-splitter\.b-chat-sidebar-splitter--expanded\s*\{(?<body>[^}]+)\}/);
    const zIndexText = expandedRule?.groups?.body.match(/z-index:\s*(?<value>\d+)/)?.groups?.value;

    expect(Number(zIndexText)).toBeGreaterThan(10000);
  });
});
