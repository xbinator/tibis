/**
 * @file session-id-runtime.test.ts
 * @description BChat 基于 sessionId 的会话运行时测试。
 * @vitest-environment jsdom
 */
import type { ChatSession } from 'types/chat';
import { defineComponent, h } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, shallowMount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BChat from '@/components/BChat/index.vue';
import type { Message, ServiceConfig } from '@/components/BChat/utils/types';
import type { TodoItem } from '@/stores/chat/todo';
import { useSettingStore } from '@/stores/ui/setting';

const chatStoreMock = vi.hoisted(() => ({
  createSession: vi.fn<(type: 'assistant', options: { title: string }) => Promise<ChatSession>>(),
  addSessionMessage: vi.fn<(sessionId: string | null, message: Message) => Promise<void>>(),
  updateSessionMessage: vi.fn<(sessionId: string | null | undefined, message: Message) => Promise<void>>(),
  setSessionMessages: vi.fn<(sessionId: string | null | undefined, messages: Message[]) => Promise<void>>(),
  getSessionMessages: vi.fn<(sessionId: string) => Promise<Message[]>>(),
  getSessions: vi.fn()
}));

const streamMock = vi.hoisted(() => ({
  resolveServiceConfig: vi.fn<() => Promise<ServiceConfig | null>>(),
  streamMessages: vi.fn<(messages: Message[], config: ServiceConfig) => Promise<void>>(),
  regenerate: vi.fn<() => Promise<boolean>>(),
  submitUserChoice: vi.fn<() => Promise<boolean>>(),
  abort: vi.fn<() => Promise<void>>()
}));

const streamLoading = vi.hoisted(() => ({ value: false }));

const autoNameMockState = vi.hoisted(() => ({
  options: undefined as
    | {
        onTitlePersisted?: (sessionId: string, title: string) => Promise<void> | void;
      }
    | undefined
}));

const todoStoreMock = vi.hoisted(
  (): {
    todosBySession: Map<string, TodoItem[]>;
    clearTodos: ReturnType<typeof vi.fn<(sessionId: string) => void>>;
    getTodos: ReturnType<typeof vi.fn<(sessionId: string) => TodoItem[]>>;
  } => {
    const todosBySession = new Map<string, TodoItem[]>();

    return {
      todosBySession,
      clearTodos: vi.fn<(sessionId: string) => void>(),
      getTodos: vi.fn<(sessionId: string) => TodoItem[]>((sessionId: string) => todosBySession.get(sessionId) ?? [])
    };
  }
);

vi.mock('vue-router', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn()
  }))
}));

vi.mock('@/components/BButton/index.vue', () => ({
  default: {
    name: 'BButton',
    props: ['disabled'],
    emits: ['click'],
    template: '<button v-bind="$attrs" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'
  }
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
    ensureLoaded: vi.fn(() => Promise.resolve()),
    getFileByPath: vi.fn()
  }))
}));

vi.mock('@/stores/chat/session', () => ({
  useChatSessionStore: vi.fn(() => chatStoreMock)
}));

vi.mock('@/stores/chat/todo', () => ({
  useTodoStore: vi.fn(() => todoStoreMock)
}));

vi.mock('@/stores/ai/serviceModel', () => ({
  useServiceModelStore: vi.fn(() => ({
    chatModel: { providerId: 'provider-1', modelId: 'model-1' },
    getAvailableServiceConfig: vi.fn(),
    loadChatModel: vi.fn(() => Promise.resolve()),
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

vi.mock('@/components/BChat/hooks/useChatStream', () => ({
  useChatStream: vi.fn(() => ({
    stream: streamMock,
    loading: streamLoading
  }))
}));

vi.mock('@/components/BChat/hooks/useAutoName', () => ({
  useAutoName: vi.fn((options: { onTitlePersisted?: (sessionId: string, title: string) => Promise<void> | void }) => {
    autoNameMockState.options = options;

    return {
      captureSnapshot: vi.fn(() => null),
      scheduleAutoName: vi.fn()
    };
  })
}));

vi.mock('@/utils/modal', () => ({
  Modal: {
    confirm: vi.fn()
  }
}));

const BPromptEditorStub = defineComponent({
  name: 'BPromptEditor',
  props: {
    value: {
      type: String,
      default: ''
    }
  },
  emits: ['update:value', 'submit', 'slash-command', 'file-mention-select'],
  setup(_props, { expose }) {
    expose({
      focus: vi.fn(),
      saveCursorPosition: vi.fn(),
      insertTextAtCursor: vi.fn(),
      getCursorPosition: vi.fn(() => 0),
      replaceTextRange: vi.fn()
    });

    return () => h('div', { 'data-testid': 'prompt-editor' });
  }
});

const InputToolbarStub = defineComponent({
  name: 'InputToolbar',
  emits: ['submit', 'abort', 'image-select', 'model-change', 'voice-start', 'voice-partial', 'voice-complete'],
  setup(_props, { emit }) {
    return () =>
      h(
        'button',
        {
          'data-testid': 'input-submit',
          onClick: () => emit('submit')
        },
        'submit'
      );
  }
});

const ConversationViewStub = defineComponent({
  name: 'ConversationView',
  setup(_props, { expose, slots }) {
    expose({
      scrollToBottom: vi.fn()
    });

    return () => h('div', { 'data-testid': 'conversation-view' }, slots.footer?.());
  }
});

const ModelSelectStub = defineComponent({
  name: 'BModelSelect',
  setup(_props, { expose }) {
    expose({
      open: vi.fn()
    });

    return () => h('div', { 'data-testid': 'model-select' });
  }
});

/**
 * 创建测试会话。
 * @param id - 会话 ID
 * @param title - 会话标题
 * @returns 测试会话
 */
function createSession(id: string, title: string): ChatSession {
  return {
    id,
    type: 'assistant',
    title,
    createdAt: '2026-06-15T00:00:00.000Z',
    updatedAt: '2026-06-15T00:00:00.000Z',
    lastMessageAt: '2026-06-15T00:00:00.000Z'
  };
}

/**
 * 创建测试消息。
 * @param id - 消息 ID
 * @param content - 消息内容
 * @returns 测试消息
 */
function createMessage(id: string, content: string): Message {
  return {
    id,
    role: 'user',
    content,
    parts: [{ type: 'text', text: content }],
    createdAt: '2026-06-15T00:00:00.000Z'
  };
}

/**
 * 挂载 BChat。
 * @param sessionId - 当前会话 ID
 * @returns 组件包装器
 */
function mountBChat(sessionId: string | null = null): ReturnType<typeof shallowMount> {
  return shallowMount(BChat, {
    props: {
      sessionId
    },
    global: {
      stubs: {
        BIcon: true,
        BModelSelect: ModelSelectStub,
        BPanelSplitter: {
          template: '<div><slot /></div>'
        },
        BPromptEditor: BPromptEditorStub,
        ConfirmationSheet: true,
        ConversationView: ConversationViewStub,
        ImagePreview: true,
        InputToolbar: InputToolbarStub,
        InteractionContainer: true,
        SessionHistory: true,
        TodoPanel: true,
        UsagePanel: true
      }
    }
  });
}

describe('BChat sessionId runtime', (): void => {
  beforeEach((): void => {
    setActivePinia(createPinia());
    localStorage.clear();
    streamLoading.value = false;
    chatStoreMock.createSession.mockReset();
    chatStoreMock.addSessionMessage.mockReset();
    chatStoreMock.updateSessionMessage.mockReset();
    chatStoreMock.setSessionMessages.mockReset();
    chatStoreMock.getSessionMessages.mockReset();
    chatStoreMock.getSessions.mockReset();
    streamMock.resolveServiceConfig.mockReset();
    streamMock.streamMessages.mockReset();
    streamMock.regenerate.mockReset();
    streamMock.submitUserChoice.mockReset();
    streamMock.abort.mockReset();
    todoStoreMock.todosBySession.clear();
    todoStoreMock.clearTodos.mockReset();
    todoStoreMock.getTodos.mockClear();
    autoNameMockState.options = undefined;
    chatStoreMock.getSessionMessages.mockResolvedValue([]);
    chatStoreMock.getSessions.mockResolvedValue({ items: [], hasMore: false });
    chatStoreMock.addSessionMessage.mockResolvedValue();
    chatStoreMock.updateSessionMessage.mockResolvedValue();
    chatStoreMock.setSessionMessages.mockResolvedValue();
    streamMock.resolveServiceConfig.mockResolvedValue({
      providerId: 'provider-1',
      modelId: 'model-1',
      toolSupport: { supported: true }
    });
    streamMock.streamMessages.mockResolvedValue();
    useSettingStore().setSidebarVisible(true);
  });

  it('creates a session on first submit when sessionId is empty and persists with the new id', async (): Promise<void> => {
    const createdSession = createSession('session-created', 'hello');
    chatStoreMock.createSession.mockResolvedValue(createdSession);
    const wrapper = mountBChat(null);
    await flushPromises();

    wrapper.findComponent(BPromptEditorStub).vm.$emit('update:value', 'hello');
    await flushPromises();
    wrapper.findComponent(InputToolbarStub).vm.$emit('submit');
    await flushPromises();

    expect(chatStoreMock.createSession).toHaveBeenCalledWith('assistant', { title: 'hello' });
    expect(wrapper.emitted('session-created')?.[0]).toEqual([createdSession]);
    expect(chatStoreMock.addSessionMessage).toHaveBeenCalledWith('session-created', expect.objectContaining({ role: 'user', content: 'hello' }));
    expect(streamMock.streamMessages).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted('loading-change')).toContainEqual([true]);
  });

  it('loads history when sessionId changes to an external session', async (): Promise<void> => {
    const loadedMessage = createMessage('message-loaded', 'history message');
    const wrapper = mountBChat(null);
    await flushPromises();
    chatStoreMock.getSessionMessages.mockResolvedValue([loadedMessage]);

    await wrapper.setProps({ sessionId: 'session-external' });
    await flushPromises();

    expect(chatStoreMock.getSessionMessages).toHaveBeenCalledWith('session-external');
  });

  it('skips history reload when an internally created session id is written back', async (): Promise<void> => {
    const createdSession = createSession('session-created', 'hello');
    chatStoreMock.createSession.mockResolvedValue(createdSession);
    const wrapper = mountBChat(null);
    await flushPromises();

    wrapper.findComponent(BPromptEditorStub).vm.$emit('update:value', 'hello');
    await flushPromises();
    wrapper.findComponent(InputToolbarStub).vm.$emit('submit');
    await flushPromises();
    chatStoreMock.getSessionMessages.mockClear();

    await wrapper.setProps({ sessionId: 'session-created' });
    await flushPromises();

    expect(chatStoreMock.getSessionMessages).not.toHaveBeenCalled();
  });

  it('emits session title persisted after auto name callback runs', async (): Promise<void> => {
    const wrapper = mountBChat('session-1');
    await flushPromises();

    await autoNameMockState.options?.onTitlePersisted?.('session-1', '生成标题');
    await flushPromises();

    expect(wrapper.emitted('session-title-persisted')?.[0]).toEqual(['session-1', '生成标题']);
  });

  it('folds todo panel when all todos are finished after session change', async (): Promise<void> => {
    todoStoreMock.todosBySession.set('session-active', [{ content: '执行任务', status: 'in_progress', priority: 'high' }]);
    todoStoreMock.todosBySession.set('session-finished', [{ content: '完成任务', status: 'completed', priority: 'medium' }]);
    const wrapper = mountBChat('session-active');
    await flushPromises();

    await wrapper.setProps({ sessionId: 'session-finished' });
    await flushPromises();

    expect(wrapper.findComponent({ name: 'TodoPanel' }).props('visible')).toBe(false);
  });

  it('passes active session id to todo panel for local close handling', async (): Promise<void> => {
    todoStoreMock.todosBySession.set('session-finished', [{ content: '完成任务', status: 'completed', priority: 'medium' }]);
    const wrapper = mountBChat('session-finished');
    await flushPromises();

    expect(wrapper.findComponent({ name: 'TodoPanel' }).props('sessionId')).toBe('session-finished');
  });
});
