/**
 * @file session-id-runtime.test.ts
 * @description BChat 基于 sessionId 的会话运行时测试。
 * @vitest-environment jsdom
 */
import type { AIUserChoiceAnswerData, ChatMessageToolPart, ChatSession } from 'types/chat';
import type { ChatRuntimeContinueInput } from 'types/chat-runtime';
import { defineComponent, h } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, shallowMount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BChat from '@/components/BChat/index.vue';
import type { Message } from '@/components/BChat/utils/types';
import { emitChatFileReferenceInsert } from '@/shared/chat/fileReference';
import type { TodoItem } from '@/stores/chat/todo';
import { useSettingStore } from '@/stores/ui/setting';
import { emitRuntimeEvent, resetRuntimeEventListeners, type RuntimeEventListeners } from './runtime-event-test-utils';

const chatStoreMock = vi.hoisted(() => ({
  createSession: vi.fn<(type: 'assistant', options: { title: string }) => Promise<ChatSession>>(),
  addSessionMessage: vi.fn<(sessionId: string | null, message: Message) => Promise<void>>(),
  updateSessionMessage: vi.fn<(sessionId: string | null | undefined, message: Message) => Promise<void>>(),
  setSessionMessages: vi.fn<(sessionId: string | null | undefined, messages: Message[]) => Promise<void>>(),
  getSessionMessages: vi.fn<(sessionId: string) => Promise<Message[]>>(),
  getSessions: vi.fn()
}));

const promptEditorMockState = vi.hoisted(() => ({
  focus: vi.fn(),
  saveCursorPosition: vi.fn(),
  insertTextAtCursor: vi.fn<(text: string) => void>(),
  getCursorPosition: vi.fn<() => number>(() => 0),
  replaceTextRange: vi.fn()
}));
const getPathForFileMock = vi.hoisted(() => vi.fn<(_file: File) => string | null>().mockReturnValue('/workspace/My Notes/note.md'));
const getAvailableServiceConfigMock = vi.hoisted(() => vi.fn());
const getModelToolSupportMock = vi.hoisted(() => vi.fn());
const runtimeListeners = vi.hoisted<RuntimeEventListeners>(() => ({}));
const electronAPIMock = vi.hoisted(() => ({
  chatCompressionUpdateStatus: vi.fn(),
  chatRuntimeSend: vi.fn(),
  chatRuntimeContinue: vi.fn(),
  chatRuntimeSubmitUserChoice: vi.fn(),
  chatRuntimeAbort: vi.fn(),
  chatRuntimeCompact: vi.fn(),
  chatRuntimeSubmitToolResult: vi.fn(),
  chatRuntimeSubmitConfirmation: vi.fn(),
  chatRuntimeSubmitBridgeResponse: vi.fn(),
  chatRuntimeOnMessageCreated: vi.fn(() => vi.fn()),
  chatRuntimeOnMessageUpdated: vi.fn((callback: NonNullable<typeof runtimeListeners.messageUpdated>) => {
    runtimeListeners.messageUpdated = callback;
    return vi.fn();
  }),
  chatRuntimeOnMessageDeleted: vi.fn((callback: NonNullable<typeof runtimeListeners.messageDeleted>) => {
    runtimeListeners.messageDeleted = callback;
    return vi.fn();
  }),
  chatRuntimeOnContextUsageUpdated: vi.fn((callback: NonNullable<typeof runtimeListeners.contextUsage>) => {
    runtimeListeners.contextUsage = callback;
    return vi.fn();
  }),
  chatRuntimeOnToolRequest: vi.fn(() => vi.fn()),
  chatRuntimeOnConfirmationRequested: vi.fn(() => vi.fn()),
  chatRuntimeOnBridgeRequested: vi.fn(() => vi.fn()),
  chatRuntimeOnError: vi.fn(() => vi.fn()),
  chatRuntimeOnComplete: vi.fn(() => vi.fn())
}));

const autoNameMockState = vi.hoisted(() => ({
  options: undefined as
    | {
        onTitlePersisted?: (sessionId: string, title: string) => Promise<void> | void;
      }
    | undefined
}));

const toolSettingsMockState = vi.hoisted(() => ({
  tavily: undefined as { enabled: boolean; apiKey: string } | undefined,
  mcp: {
    servers: [] as Array<{
      id: string;
      name: string;
      enabled: boolean;
      transport: 'stdio' | 'streamableHTTP' | 'sse';
      url?: string;
      command: string;
      args: string[];
      env: Record<string, string>;
      headers: Record<string, string>;
      toolAllowlist: string[];
    }>
  }
}));

const memoryStoreMock = vi.hoisted(() => ({
  loaded: true,
  loadMemory: vi.fn<() => Promise<void>>(),
  buildSystemPromptContext: vi.fn<() => string>(() => '')
}));

const modalMock = vi.hoisted(() => ({
  confirm: vi.fn<(title: string, content: string, options?: unknown) => Promise<[boolean]>>()
}));

const todoStoreMock = vi.hoisted(
  (): {
    todosBySession: Map<string, TodoItem[]>;
    clearTodos: ReturnType<typeof vi.fn<(sessionId: string) => void>>;
    getTodos: ReturnType<typeof vi.fn<(sessionId: string) => TodoItem[]>>;
    restoreBeforeRuntimeIds: ReturnType<typeof vi.fn<(sessionId: string, runtimeIds: string[]) => boolean>>;
  } => {
    const todosBySession = new Map<string, TodoItem[]>();

    return {
      todosBySession,
      clearTodos: vi.fn<(sessionId: string) => void>((sessionId: string): void => {
        todosBySession.delete(sessionId);
      }),
      getTodos: vi.fn<(sessionId: string) => TodoItem[]>((sessionId: string) => todosBySession.get(sessionId) ?? []),
      restoreBeforeRuntimeIds: vi.fn<(sessionId: string, runtimeIds: string[]) => boolean>(() => false)
    };
  }
);

const conversationViewMockState = vi.hoisted(() => ({
  scrollToBottom: vi.fn<() => void>()
}));

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
    onSkillChanged: vi.fn(() => vi.fn()),
    getPathForFile: getPathForFileMock
  }
}));

vi.mock('@/shared/platform/electron-api', () => ({
  getElectronAPI: vi.fn(() => electronAPIMock),
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
    getAvailableServiceConfig: getAvailableServiceConfigMock,
    loadChatModel: vi.fn(() => Promise.resolve()),
    setChatModel: vi.fn()
  }))
}));

vi.mock('@/ai/tools/policy', () => ({
  getModelToolSupport: getModelToolSupportMock
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
  useToolSettingsStore: vi.fn(() => toolSettingsMockState)
}));

vi.mock('@/stores/ai/memory', () => ({
  useMemoryStore: vi.fn(() => memoryStoreMock)
}));

vi.mock('@/stores/ai/skill', () => ({
  useSkillStore: vi.fn(() => ({
    initialized: false,
    getEnabledSkills: vi.fn(() => []),
    init: vi.fn(),
    handleSkillChange: vi.fn()
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
  Modal: modalMock
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
      focus: promptEditorMockState.focus,
      saveCursorPosition: promptEditorMockState.saveCursorPosition,
      insertTextAtCursor: promptEditorMockState.insertTextAtCursor,
      getCursorPosition: promptEditorMockState.getCursorPosition,
      replaceTextRange: promptEditorMockState.replaceTextRange
    });

    return () => h('div', { 'data-testid': 'prompt-editor' });
  }
});

const InputToolbarStub = defineComponent({
  name: 'InputToolbar',
  props: {
    contextUsage: {
      type: Object,
      default: undefined
    }
  },
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
  props: {
    messages: {
      type: Array,
      default: () => []
    }
  },
  emits: ['regenerate', 'rollback', 'user-choice-submit'],
  setup(_props, { expose, slots }) {
    expose({
      scrollToBottom: conversationViewMockState.scrollToBottom
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
 * 创建测试用助手消息。
 * @param overrides - 需要覆盖的消息字段。
 * @returns 测试助手消息。
 */
function createAssistantMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: 'assistant content',
    parts: [{ type: 'text', text: 'assistant content' }],
    createdAt: '2026-06-15T00:00:01.000Z',
    loading: false,
    finished: true,
    ...overrides
  };
}

/**
 * 创建带文件拖拽数据的 DOM 事件。
 * @param type - 事件类型
 * @param files - 拖拽文件列表
 * @returns 拖拽事件
 */
function createFileDragEvent(type: 'dragenter' | 'dragover' | 'dragleave' | 'drop', files: File[]): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      files,
      types: ['Files'],
      dropEffect: 'none'
    }
  });
  return event;
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
    chatStoreMock.createSession.mockReset();
    chatStoreMock.addSessionMessage.mockReset();
    chatStoreMock.updateSessionMessage.mockReset();
    chatStoreMock.setSessionMessages.mockReset();
    chatStoreMock.getSessionMessages.mockReset();
    chatStoreMock.getSessions.mockReset();
    electronAPIMock.chatCompressionUpdateStatus.mockReset();
    electronAPIMock.chatRuntimeSend.mockReset();
    electronAPIMock.chatRuntimeContinue.mockReset();
    electronAPIMock.chatRuntimeSubmitUserChoice.mockReset();
    electronAPIMock.chatRuntimeAbort.mockReset();
    electronAPIMock.chatRuntimeCompact.mockReset();
    electronAPIMock.chatRuntimeSubmitToolResult.mockReset();
    electronAPIMock.chatRuntimeSubmitConfirmation.mockReset();
    electronAPIMock.chatRuntimeSubmitBridgeResponse.mockReset();
    electronAPIMock.chatRuntimeOnMessageCreated.mockClear();
    electronAPIMock.chatRuntimeOnMessageUpdated.mockClear();
    electronAPIMock.chatRuntimeOnMessageDeleted.mockClear();
    electronAPIMock.chatRuntimeOnContextUsageUpdated.mockClear();
    electronAPIMock.chatRuntimeOnToolRequest.mockClear();
    electronAPIMock.chatRuntimeOnConfirmationRequested.mockClear();
    electronAPIMock.chatRuntimeOnBridgeRequested.mockClear();
    electronAPIMock.chatRuntimeOnError.mockClear();
    electronAPIMock.chatRuntimeOnComplete.mockClear();
    getAvailableServiceConfigMock.mockReset();
    getModelToolSupportMock.mockReset();
    promptEditorMockState.focus.mockReset();
    promptEditorMockState.saveCursorPosition.mockReset();
    promptEditorMockState.insertTextAtCursor.mockReset();
    promptEditorMockState.getCursorPosition.mockReset();
    promptEditorMockState.getCursorPosition.mockReturnValue(0);
    promptEditorMockState.replaceTextRange.mockReset();
    getPathForFileMock.mockReset();
    getPathForFileMock.mockReturnValue('/workspace/My Notes/note.md');
    todoStoreMock.todosBySession.clear();
    todoStoreMock.clearTodos.mockReset();
    todoStoreMock.getTodos.mockClear();
    todoStoreMock.restoreBeforeRuntimeIds.mockReset();
    todoStoreMock.restoreBeforeRuntimeIds.mockReturnValue(false);
    modalMock.confirm.mockReset();
    modalMock.confirm.mockResolvedValue([false]);
    autoNameMockState.options = undefined;
    toolSettingsMockState.tavily = undefined;
    toolSettingsMockState.mcp.servers = [];
    memoryStoreMock.loaded = true;
    memoryStoreMock.loadMemory.mockReset();
    memoryStoreMock.loadMemory.mockResolvedValue();
    memoryStoreMock.buildSystemPromptContext.mockReset();
    memoryStoreMock.buildSystemPromptContext.mockReturnValue('');
    resetRuntimeEventListeners(runtimeListeners);
    conversationViewMockState.scrollToBottom.mockReset();
    chatStoreMock.getSessionMessages.mockResolvedValue([]);
    chatStoreMock.getSessions.mockResolvedValue({ items: [], hasMore: false });
    chatStoreMock.addSessionMessage.mockResolvedValue();
    chatStoreMock.updateSessionMessage.mockResolvedValue();
    chatStoreMock.setSessionMessages.mockResolvedValue();
    electronAPIMock.chatRuntimeSend.mockResolvedValue({
      ok: true,
      data: { runtimeId: 'runtime-1', sessionId: 'session-created' }
    });
    electronAPIMock.chatRuntimeContinue.mockResolvedValue({
      ok: true,
      data: { runtimeId: 'runtime-continued', sessionId: 'session-active' }
    });
    electronAPIMock.chatRuntimeSubmitUserChoice.mockResolvedValue({
      ok: true,
      data: { runtimeId: 'runtime-choice', sessionId: 'session-active' }
    });
    electronAPIMock.chatRuntimeCompact.mockResolvedValue({
      ok: true,
      data: { status: 'skipped', reason: 'no_messages' }
    });
    electronAPIMock.chatRuntimeAbort.mockResolvedValue({ ok: true });
    electronAPIMock.chatRuntimeSubmitToolResult.mockResolvedValue({ ok: true });
    electronAPIMock.chatRuntimeSubmitConfirmation.mockResolvedValue({ ok: true });
    electronAPIMock.chatRuntimeSubmitBridgeResponse.mockResolvedValue({ ok: true });
    getAvailableServiceConfigMock.mockResolvedValue({
      providerId: 'provider-1',
      modelId: 'model-1'
    });
    getModelToolSupportMock.mockResolvedValue({ supported: true });
    useSettingStore().setSidebarVisible(true);
  });

  it('consumes a pending selection reference emitted before BChat is mounted', async (): Promise<void> => {
    const settingStore = useSettingStore();
    settingStore.setSidebarVisible(false);

    emitChatFileReferenceInsert({
      id: 'doc-1',
      ext: 'md',
      filePath: '/workspace/note.md',
      fileName: 'note',
      startLine: 2,
      endLine: 4
    });
    expect(promptEditorMockState.insertTextAtCursor).not.toHaveBeenCalled();

    const wrapper = mountBChat(null);
    await flushPromises();

    expect(settingStore.sidebarVisible).toBe(true);
    expect(promptEditorMockState.saveCursorPosition).toHaveBeenCalledTimes(1);
    expect(promptEditorMockState.insertTextAtCursor).toHaveBeenCalledWith('{{#/workspace/note.md 2-4}} ');
    expect(promptEditorMockState.focus).toHaveBeenCalled();

    wrapper.unmount();
  });

  it('creates a session on first submit when sessionId is empty and starts runtime with the new id', async (): Promise<void> => {
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
    expect(electronAPIMock.chatRuntimeSend).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'session-created', content: 'hello' }));
    expect(wrapper.emitted('loading-change')).toContainEqual([true]);
  });

  it('sends new user messages through main process ChatRuntime', async (): Promise<void> => {
    const createdSession = createSession('session-created', 'hello');
    chatStoreMock.createSession.mockResolvedValue(createdSession);
    const wrapper = mountBChat(null);
    await flushPromises();

    wrapper.findComponent(BPromptEditorStub).vm.$emit('update:value', 'hello');
    await flushPromises();
    wrapper.findComponent(InputToolbarStub).vm.$emit('submit');
    await flushPromises();

    expect(electronAPIMock.chatRuntimeSend).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-created',
        clientId: 'bchat',
        agentId: 'default',
        content: 'hello',
        contextWindow: 200000,
        userMessageId: expect.any(String),
        userMessageCreatedAt: expect.any(String)
      })
    );
    expect(wrapper.findComponent(ConversationViewStub).props('messages')).toEqual([]);
    expect(chatStoreMock.addSessionMessage).not.toHaveBeenCalledWith('session-created', expect.objectContaining({ role: 'user', content: 'hello' }));
  });

  it('sends parsed file input parts to ChatRuntime', async (): Promise<void> => {
    const createdSession = createSession('session-created', 'fix {{#src/foo.ts}}');
    chatStoreMock.createSession.mockResolvedValue(createdSession);
    const wrapper = mountBChat(null);
    await flushPromises();

    wrapper.findComponent(BPromptEditorStub).vm.$emit('update:value', 'fix {{#src/foo.ts}}');
    await flushPromises();
    wrapper.findComponent(InputToolbarStub).vm.$emit('submit');
    await flushPromises();

    expect(electronAPIMock.chatRuntimeSend).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-created',
        content: 'fix {{#src/foo.ts}}',
        parts: [
          { type: 'text', text: 'fix ' },
          expect.objectContaining({ type: 'file', path: 'src/foo.ts' })
        ]
      })
    );
  });

  it('does not append a renderer-side interrupt message when aborting a chat runtime', async (): Promise<void> => {
    const wrapper = mountBChat('session-active');
    await flushPromises();

    wrapper.findComponent(BPromptEditorStub).vm.$emit('update:value', 'stop me');
    await flushPromises();
    wrapper.findComponent(InputToolbarStub).vm.$emit('submit');
    await flushPromises();
    wrapper.findComponent(InputToolbarStub).vm.$emit('abort');
    await flushPromises();

    expect(electronAPIMock.chatRuntimeAbort).toHaveBeenCalledWith({ runtimeId: 'runtime-1' });
    expect(chatStoreMock.addSessionMessage).not.toHaveBeenCalledWith('session-active', expect.objectContaining({ role: 'interrupt' }));
  });

  it('does not scroll to bottom when runtime streams message updates', async (): Promise<void> => {
    const wrapper = mountBChat('session-active');
    await flushPromises();
    conversationViewMockState.scrollToBottom.mockReset();

    emitRuntimeEvent(runtimeListeners, 'messageUpdated', {
      runtimeId: 'runtime-1',
      sessionId: 'session-active',
      clientId: 'bchat',
      agentId: 'default',
      message: {
        ...createAssistantMessage({
          id: 'assistant-streaming',
          content: 'streaming',
          parts: [{ type: 'text', text: 'streaming' }],
          loading: true,
          finished: false,
          runtimeId: 'runtime-1'
        }),
        sessionId: 'session-active'
      }
    });
    await flushPromises();

    expect(wrapper.findComponent(ConversationViewStub).exists()).toBe(true);
    expect(conversationViewMockState.scrollToBottom).not.toHaveBeenCalled();
  });

  it('continues user choice answers through main process ChatRuntime', async (): Promise<void> => {
    const pendingToolPart: ChatMessageToolPart = {
      type: 'tool',
      toolCallId: 'tool-call-1',
      toolName: 'ask_user_choice',
      status: 'done',
      input: {},
      result: {
        toolName: 'ask_user_choice',
        status: 'awaiting_user_input',
        data: {
          questionId: 'question-1',
          toolCallId: 'tool-call-1',
          mode: 'single',
          question: '继续吗？',
          options: [{ label: '继续', value: 'yes' }]
        }
      }
    };
    const userMessage = createMessage('user-choice', '需要选择');
    const assistantMessage = createAssistantMessage({
      id: 'assistant-choice',
      content: '',
      parts: [pendingToolPart]
    });
    const answer: AIUserChoiceAnswerData = {
      questionId: 'question-1',
      toolCallId: 'tool-call-1',
      answers: ['yes'],
      otherText: ''
    };
    chatStoreMock.getSessionMessages.mockResolvedValueOnce([userMessage, assistantMessage]).mockResolvedValueOnce([]);
    const wrapper = mountBChat('session-active');
    await flushPromises();

    wrapper.findComponent(ConversationViewStub).vm.$emit('user-choice-submit', answer);
    await flushPromises();

    expect(electronAPIMock.chatRuntimeSubmitUserChoice).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-active',
        clientId: 'bchat',
        agentId: 'default',
        contextWindow: 200000,
        answer
      })
    );
    expect(electronAPIMock.chatRuntimeSubmitUserChoice.mock.calls[0]?.[0]).not.toHaveProperty('messages');
    expect(electronAPIMock.chatRuntimeContinue).not.toHaveBeenCalled();
  });

  it('regenerates assistant messages through main process ChatRuntime', async (): Promise<void> => {
    const userMessage = createMessage('user-regenerate', '重新回答');
    const assistantMessage = createAssistantMessage({
      id: 'assistant-old',
      content: '旧回答',
      parts: [{ type: 'text', text: '旧回答' }]
    });
    chatStoreMock.getSessionMessages.mockResolvedValueOnce([userMessage, assistantMessage]).mockResolvedValueOnce([]);
    const wrapper = mountBChat('session-active');
    await flushPromises();

    wrapper.findComponent(ConversationViewStub).vm.$emit('regenerate', assistantMessage);
    await flushPromises();

    expect(chatStoreMock.setSessionMessages).toHaveBeenCalledWith('session-active', [userMessage]);
    expect(chatStoreMock.addSessionMessage).not.toHaveBeenCalledWith(
      'session-active',
      expect.objectContaining({ role: 'assistant', content: '', loading: true, finished: false })
    );
    expect(electronAPIMock.chatRuntimeContinue).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-active',
        clientId: 'bchat',
        agentId: 'default',
        contextWindow: 200000
      })
    );
    const [continueInput] = electronAPIMock.chatRuntimeContinue.mock.calls[0] as [ChatRuntimeContinueInput];
    expect(continueInput.messages).toEqual([expect.objectContaining({ id: 'user-regenerate', role: 'user' })]);
  });

  it('restores todo snapshots for runtime ids removed by rollback', async (): Promise<void> => {
    const firstUserMessage = { ...createMessage('user-1', '第一轮'), runtimeId: 'runtime-1', finished: true };
    const firstAssistantMessage = createAssistantMessage({
      id: 'assistant-1',
      content: '第一轮回答',
      runtimeId: 'runtime-1'
    });
    const secondUserMessage = { ...createMessage('user-2', '第二轮'), runtimeId: 'runtime-2', finished: true };
    const secondAssistantMessage = createAssistantMessage({
      id: 'assistant-2',
      content: '第二轮回答',
      runtimeId: 'runtime-2'
    });
    chatStoreMock.getSessionMessages
      .mockResolvedValueOnce([firstUserMessage, firstAssistantMessage, secondUserMessage, secondAssistantMessage])
      .mockResolvedValueOnce([]);
    const wrapper = mountBChat('session-active');
    await flushPromises();

    wrapper.findComponent(ConversationViewStub).vm.$emit('rollback', secondUserMessage);
    await flushPromises();

    expect(chatStoreMock.setSessionMessages).toHaveBeenCalledWith('session-active', [firstUserMessage, firstAssistantMessage]);
    expect(todoStoreMock.restoreBeforeRuntimeIds).toHaveBeenCalledWith('session-active', ['runtime-2']);
  });

  it('leaves automatic compaction to the main process runtime before sending', async (): Promise<void> => {
    chatStoreMock.getSessionMessages.mockResolvedValue([createMessage('large-history', 'context '.repeat(80_000))]);
    const wrapper = mountBChat('session-active');
    await flushPromises();

    wrapper.findComponent(BPromptEditorStub).vm.$emit('update:value', 'hello after long history');
    await flushPromises();
    wrapper.findComponent(InputToolbarStub).vm.$emit('submit');
    await flushPromises();

    expect(electronAPIMock.chatRuntimeSend).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'session-active', content: 'hello after long history' }));
    expect(electronAPIMock.chatRuntimeCompact).not.toHaveBeenCalled();
  });

  it('passes main-process executable context options to runtime send', async (): Promise<void> => {
    memoryStoreMock.loaded = false;
    memoryStoreMock.buildSystemPromptContext.mockReturnValue('Remember user prefers concise answers.');
    toolSettingsMockState.tavily = { enabled: true, apiKey: 'tvly-test' };
    toolSettingsMockState.mcp.servers = [
      {
        id: 'server-1',
        name: 'Docs',
        enabled: true,
        transport: 'stdio',
        command: 'node',
        args: ['server.js'],
        env: { TOKEN: 'secret' },
        headers: {},
        toolAllowlist: ['search_docs']
      }
    ];
    const wrapper = mountBChat('session-active');
    await flushPromises();

    wrapper.findComponent(BPromptEditorStub).vm.$emit('update:value', 'use tools');
    await flushPromises();
    wrapper.findComponent(InputToolbarStub).vm.$emit('submit');
    await flushPromises();

    expect(memoryStoreMock.loadMemory).toHaveBeenCalled();
    expect(electronAPIMock.chatRuntimeSend).toHaveBeenCalledWith(
      expect.objectContaining({
        system: 'Remember user prefers concise answers.',
        tavily: { enabled: true, apiKey: 'tvly-test' },
        mcp: {
          servers: [
            expect.objectContaining({
              id: 'server-1',
              args: ['server.js'],
              env: { TOKEN: 'secret' },
              headers: {},
              toolAllowlist: ['search_docs']
            })
          ],
          enabledServerIds: ['server-1'],
          enabledTools: [],
          toolInstructions: ''
        }
      })
    );
  });

  it('passes runtime context usage updates to the input toolbar', async (): Promise<void> => {
    const wrapper = mountBChat('session-active');
    await flushPromises();

    emitRuntimeEvent(runtimeListeners, 'contextUsage', {
      runtimeId: 'runtime-1',
      sessionId: 'session-active',
      clientId: 'bchat',
      agentId: 'default',
      snapshot: {
        runtimeId: 'runtime-1',
        sessionId: 'session-active',
        agentId: 'default',
        contextWindow: 200000,
        reservedOutputTokens: 8192,
        compactionBufferTokens: 4000,
        usableInputTokens: 187808,
        estimatedInputTokens: 1234,
        usagePercent: 1,
        remainingInputTokens: 186574,
        status: 'safe',
        shouldCompactBeforeSend: false
      }
    });
    await flushPromises();

    expect(wrapper.findComponent(InputToolbarStub).props('contextUsage')).toMatchObject({
      usedTokens: 1234,
      contextWindow: 200000,
      reservedOutputTokens: 8192,
      safetyMarginTokens: 4000,
      usableInputTokens: 187808,
      usagePercent: 1,
      remainingInputTokens: 186574,
      status: 'safe'
    });
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

  it('clears finished todos immediately after session change', async (): Promise<void> => {
    todoStoreMock.todosBySession.set('session-active', [{ content: '执行任务', status: 'in_progress', priority: 'high' }]);
    todoStoreMock.todosBySession.set('session-finished', [{ content: '完成任务', status: 'completed', priority: 'medium' }]);
    const wrapper = mountBChat('session-active');
    await flushPromises();

    await wrapper.setProps({ sessionId: 'session-finished' });
    await flushPromises();

    expect(todoStoreMock.clearTodos).toHaveBeenCalledWith('session-finished');
    expect(wrapper.findComponent({ name: 'TodoPanel' }).exists()).toBe(false);
  });

  it('keeps active todo panel collapsed by default for unfinished todos', async (): Promise<void> => {
    todoStoreMock.todosBySession.set('session-active', [{ content: '执行任务', status: 'in_progress', priority: 'high' }]);
    const wrapper = mountBChat('session-active');
    await flushPromises();

    expect(wrapper.findComponent({ name: 'TodoPanel' }).props('visible')).toBe(false);
    expect(todoStoreMock.clearTodos).not.toHaveBeenCalled();
  });

  it('clears finished todos on mount so refresh does not restore the panel', async (): Promise<void> => {
    todoStoreMock.todosBySession.set('session-finished', [{ content: '完成任务', status: 'completed', priority: 'medium' }]);
    const wrapper = mountBChat('session-finished');
    await flushPromises();

    expect(todoStoreMock.clearTodos).toHaveBeenCalledWith('session-finished');
    expect(wrapper.findComponent({ name: 'TodoPanel' }).exists()).toBe(false);
  });

  it('does not append a renderer-side interrupt message when cancelling an active compression task', async (): Promise<void> => {
    chatStoreMock.getSessionMessages.mockResolvedValue([
      createMessage('message-1', '第一轮上下文'),
      createMessage('message-2', '第二轮上下文'),
      createMessage('message-3', '第三轮上下文'),
      createMessage('message-4', '第四轮上下文'),
      createMessage('message-5', '第五轮上下文'),
      createMessage('message-6', '第六轮上下文')
    ]);
    electronAPIMock.chatRuntimeCompact.mockImplementation(
      () =>
        new Promise(() => {
          // 保持压缩任务挂起，便于测试取消时不会写入聊天中断消息。
        })
    );
    const wrapper = mountBChat('session-active');
    await flushPromises();

    wrapper.findComponent(BPromptEditorStub).vm.$emit('slash-command', {
      id: 'compact',
      trigger: '/compact',
      title: '压缩上下文',
      description: '立即执行一次手动上下文压缩',
      type: 'action'
    });
    await flushPromises();

    wrapper.findComponent(InputToolbarStub).vm.$emit('abort');
    await flushPromises();

    expect(chatStoreMock.addSessionMessage).not.toHaveBeenCalledWith('session-active', expect.objectContaining({ role: 'interrupt' }));
    const [compactInput] = electronAPIMock.chatRuntimeCompact.mock.calls[0] as [{ runtimeId: string }];
    expect(electronAPIMock.chatRuntimeAbort).toHaveBeenCalledWith({ runtimeId: compactInput.runtimeId });
    expect(electronAPIMock.chatRuntimeCompact).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'session-active', reason: 'manual' }));
  });

  it('highlights the input container while dragging files over it', async (): Promise<void> => {
    const wrapper = mountBChat(null);
    await flushPromises();
    const inputContainer = wrapper.find('.b-chat__input-container');

    await inputContainer.element.dispatchEvent(createFileDragEvent('dragenter', [new File(['hello'], 'note.md', { type: 'text/markdown' })]));
    await wrapper.vm.$nextTick();

    expect(inputContainer.classes()).toContain('b-chat__input-container--dragover');

    await inputContainer.element.dispatchEvent(createFileDragEvent('dragleave', [new File(['hello'], 'note.md', { type: 'text/markdown' })]));
    await wrapper.vm.$nextTick();

    expect(inputContainer.classes()).not.toContain('b-chat__input-container--dragover');
  });

  it('inserts file reference tokens when non-image files are dropped on the input container', async (): Promise<void> => {
    const wrapper = mountBChat(null);
    await flushPromises();

    await wrapper
      .find('.b-chat__input-container')
      .element.dispatchEvent(createFileDragEvent('drop', [new File(['hello'], 'note.md', { type: 'text/markdown' })]));
    await flushPromises();

    expect(promptEditorMockState.insertTextAtCursor).toHaveBeenCalledWith('{{#[](%2Fworkspace%2FMy%20Notes%2Fnote.md)}}');
  });

  it('adds image files when images are dropped on the input container', async (): Promise<void> => {
    const wrapper = mountBChat(null);
    await flushPromises();

    await wrapper
      .find('.b-chat__input-container')
      .element.dispatchEvent(createFileDragEvent('drop', [new File(['image'], 'photo.png', { type: 'image/png' })]));
    await flushPromises();

    expect(promptEditorMockState.insertTextAtCursor).not.toHaveBeenCalled();
  });

  it('processes mixed dropped files with image upload and file reference insertion', async (): Promise<void> => {
    const wrapper = mountBChat(null);
    await flushPromises();

    await wrapper
      .find('.b-chat__input-container')
      .element.dispatchEvent(
        createFileDragEvent('drop', [new File(['image'], 'photo.png', { type: 'image/png' }), new File(['hello'], 'note.md', { type: 'text/markdown' })])
      );
    await flushPromises();

    expect(promptEditorMockState.insertTextAtCursor).toHaveBeenCalledWith('{{#[](%2Fworkspace%2FMy%20Notes%2Fnote.md)}}');
  });

  it('falls back to filename token when dropped file path cannot be resolved', async (): Promise<void> => {
    getPathForFileMock.mockReturnValue(null);
    const wrapper = mountBChat(null);
    await flushPromises();

    await wrapper
      .find('.b-chat__input-container')
      .element.dispatchEvent(createFileDragEvent('drop', [new File(['hello'], 'note.md', { type: 'text/markdown' })]));
    await flushPromises();

    expect(promptEditorMockState.insertTextAtCursor).toHaveBeenCalledWith('{{#[](note.md)}}');
  });

  it('clears input drag state without duplicate processing when an inner editor already handled the drop', async (): Promise<void> => {
    const wrapper = mountBChat(null);
    await flushPromises();
    const inputContainer = wrapper.find('.b-chat__input-container');

    await inputContainer.element.dispatchEvent(createFileDragEvent('dragenter', [new File(['hello'], 'note.md', { type: 'text/markdown' })]));
    await wrapper.vm.$nextTick();

    const dropEvent = createFileDragEvent('drop', [new File(['hello'], 'note.md', { type: 'text/markdown' })]);
    dropEvent.preventDefault();
    await inputContainer.element.dispatchEvent(dropEvent);
    await flushPromises();

    expect(inputContainer.classes()).not.toContain('b-chat__input-container--dragover');
    expect(promptEditorMockState.insertTextAtCursor).not.toHaveBeenCalled();
  });
});
