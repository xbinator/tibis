/**
 * @file session-id-runtime.test.ts
 * @description BChat 基于 sessionId 的会话运行时测试。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
import type { AIUserChoiceAnswerData, ChatMessageToolPart, ChatMessageWidgetPart, ChatMessageWidgetResultPart, ChatSession } from 'types/chat';
import type { ChatRuntimeContinueInput } from 'types/chat-runtime';
import { defineComponent, h, type PropType } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, shallowMount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BChat from '@/components/BChat/index.vue';
import { createMessageUpdateSubmitAction, createRuntimeUserMessageSubmitAction, createUserChoiceSubmitAction } from '@/components/BChat/utils/submitAction';
import type { Message } from '@/components/BChat/utils/types';
import type { FileMentionOption } from '@/components/BText/types';
import { createDefaultWidgetData } from '@/components/BWidget/utils/widgetData';
import { emitChatFileReferenceInsert } from '@/shared/chat/fileReference';
import type { StoredFile } from '@/shared/storage';
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
  chatRuntimeOnError: vi.fn((callback: NonNullable<typeof runtimeListeners.error>) => {
    runtimeListeners.error = callback;
    return vi.fn();
  }),
  chatRuntimeOnComplete: vi.fn((callback: NonNullable<typeof runtimeListeners.complete>) => {
    runtimeListeners.complete = callback;
    return vi.fn();
  })
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

const filesStoreMock = vi.hoisted(() => ({
  recentFiles: [] as StoredFile[],
  ensureLoaded: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  getFileByPath: vi.fn()
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
  OPERATE_WEBPAGE_TOOL_NAME: 'operate_webpage',
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
  useFilesStore: vi.fn(() => filesStoreMock)
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

const BTextEditorStub = defineComponent({
  name: 'BTextEditor',
  props: {
    value: {
      type: String,
      default: ''
    },
    fileMentions: {
      type: Array as PropType<FileMentionOption[]>,
      default: () => []
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

    return () => h('div', { class: 'prompt-editor-stub' });
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
          class: 'input-submit-stub',
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
  emits: ['regenerate', 'rollback', 'submit'],
  setup(_props, { expose, slots }) {
    expose({
      scrollToBottom: conversationViewMockState.scrollToBottom
    });

    return () => h('div', { class: 'conversation-view-stub' }, slots.footer?.());
  }
});

const CommandPanelStub = defineComponent({
  name: 'BCommandPanel',
  setup(_props, { expose }) {
    expose({
      open: vi.fn()
    });

    return () => h('div', { class: 'command-panel-stub' });
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
    parts: [{ id: 'part0035', type: 'text', text: content }],
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
    parts: [{ id: 'part0036', type: 'text', text: 'assistant content' }],
    createdAt: '2026-06-15T00:00:01.000Z',
    loading: false,
    finished: true,
    ...overrides
  };
}

/**
 * 创建测试用 Widget 消息片段。
 * @param status - 小组件状态
 * @param temperature - 状态温度值
 * @returns 小组件消息片段
 */
function createWidgetPart(status: ChatMessageWidgetPart['status'], temperature?: number): ChatMessageWidgetPart {
  return {
    id: 'widget-part-weather',
    type: 'widget',
    sessionId: 'widget-session-1',
    widgetId: 'weather',
    status,
    lifecycle: status === 'mounted' ? { mountedAt: '2026-07-01T00:00:00.000Z' } : {},
    value: {
      ...createDefaultWidgetData(),
      name: 'weather',
      description: '天气小组件',
      inputSchema: { type: 'object', properties: {} },
      dataSchema: { type: 'object', properties: {} },
      metadata: {},
      elements: []
    },
    renderContext: {
      input: {},
      data:
        temperature === undefined
          ? {}
          : {
              weather: {
                temperature
              }
            }
    }
  };
}

/**
 * 从小组件视图片段创建 open_widget 工具片段。
 * @param widget - 小组件视图片段
 * @returns 带内嵌小组件运行态的工具片段
 */
function createOpenWidgetToolPartFromWidgetPart(widget: ChatMessageWidgetPart): ChatMessageToolPart {
  return {
    id: widget.id,
    type: 'tool',
    toolCallId: `tool-call-${widget.id}`,
    toolName: 'open_widget',
    status: 'done',
    presentation: 'widget',
    input: {
      id: widget.widgetId
    },
    result: {
      toolName: 'open_widget',
      status: 'success',
      data: {
        kind: 'widget_display',
        sessionId: widget.sessionId,
        widgetId: widget.widgetId,
        value: widget.value,
        renderContext: widget.renderContext
      }
    },
    widget: {
      sessionId: widget.sessionId,
      widgetId: widget.widgetId,
      status: widget.status,
      lifecycle: widget.lifecycle,
      value: widget.value,
      renderContext: widget.renderContext
    }
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
 * 创建最近文件记录。
 * @param overrides - 需要覆盖的字段
 * @returns 最近文件记录
 */
function createStoredFile(overrides: Partial<StoredFile> = {}): StoredFile {
  return {
    type: 'file',
    id: 'file-1',
    path: '/workspace/note.md',
    content: '',
    name: 'note.md',
    ext: 'md',
    ...overrides
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
        BCommandPanel: CommandPanelStub,
        BPanelSplitter: {
          template: '<div><slot /></div>'
        },
        BTextEditor: BTextEditorStub,
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
    filesStoreMock.recentFiles = [];
    filesStoreMock.ensureLoaded.mockReset();
    filesStoreMock.ensureLoaded.mockResolvedValue();
    filesStoreMock.getFileByPath.mockReset();
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

  it('passes only markdown recent files to prompt editor file mentions', async (): Promise<void> => {
    filesStoreMock.recentFiles = [
      createStoredFile({ id: 'md-1', name: 'note.md', path: '/workspace/note.md', ext: 'md' }),
      createStoredFile({ id: 'json-1', name: 'config.json', path: '/workspace/config.json', ext: 'json' }),
      createStoredFile({ id: 'tibis-1', name: 'sketch.tibis', path: '/workspace/sketch.tibis', ext: 'tibis' })
    ];

    const wrapper = mountBChat(null);
    await flushPromises();

    expect(wrapper.findComponent(BTextEditorStub).props('fileMentions')).toEqual([
      {
        id: 'md-1',
        name: 'note.md',
        path: '/workspace/note.md',
        ext: 'md'
      }
    ]);

    wrapper.unmount();
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
    expect(promptEditorMockState.insertTextAtCursor).toHaveBeenCalledWith('{{@/workspace/note.md#L2-4}} ');
    expect(promptEditorMockState.focus).toHaveBeenCalled();

    wrapper.unmount();
  });

  it('creates a session on first submit when sessionId is empty and starts runtime with the new id', async (): Promise<void> => {
    const createdSession = createSession('session-created', 'hello');
    chatStoreMock.createSession.mockResolvedValue(createdSession);
    const wrapper = mountBChat(null);
    await flushPromises();

    wrapper.findComponent(BTextEditorStub).vm.$emit('update:value', 'hello');
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

    wrapper.findComponent(BTextEditorStub).vm.$emit('update:value', 'hello');
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

  it('sends widget-like input through ChatRuntime when no widget data source is configured', async (): Promise<void> => {
    const createdSession = createSession('session-created', '查天气 上海');
    chatStoreMock.createSession.mockResolvedValue(createdSession);
    const wrapper = mountBChat(null);
    await flushPromises();

    wrapper.findComponent(BTextEditorStub).vm.$emit('update:value', '查天气 上海');
    await flushPromises();
    wrapper.findComponent(InputToolbarStub).vm.$emit('submit');
    await flushPromises();

    const visibleMessages = wrapper.findComponent(ConversationViewStub).props('messages') as Message[];

    expect(chatStoreMock.createSession).toHaveBeenCalledWith('assistant', { title: '查天气 上海' });
    expect(visibleMessages).toEqual([]);
    expect(chatStoreMock.setSessionMessages).not.toHaveBeenCalledWith(
      'session-created',
      expect.arrayContaining([expect.objectContaining({ role: 'assistant', parts: [expect.objectContaining({ type: 'widget' })] })])
    );
    expect(getAvailableServiceConfigMock).toHaveBeenCalled();
    expect(electronAPIMock.chatRuntimeSend).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'session-created', content: '查天气 上海' }));
  });

  it('sends parsed file input parts to ChatRuntime', async (): Promise<void> => {
    const createdSession = createSession('session-created', 'fix {{@src/foo.ts}}');
    chatStoreMock.createSession.mockResolvedValue(createdSession);
    const wrapper = mountBChat(null);
    await flushPromises();

    wrapper.findComponent(BTextEditorStub).vm.$emit('update:value', 'fix {{@src/foo.ts}}');
    await flushPromises();
    wrapper.findComponent(InputToolbarStub).vm.$emit('submit');
    await flushPromises();

    expect(electronAPIMock.chatRuntimeSend).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-created',
        content: 'fix {{@src/foo.ts}}',
        parts: [expect.objectContaining({ type: 'text', text: 'fix ' }), expect.objectContaining({ type: 'file', path: 'src/foo.ts' })]
      })
    );
  });

  it('renders a send startup error as a conversation error message', async (): Promise<void> => {
    const createdSession = createSession('session-created', 'read {{@/Users/zhangbin/Desktop/Markdown 语法全量渲染测试.md}}');
    const missingFilePath = '/Users/zhangbin/Desktop/Markdown 语法全量渲染测试.md';
    chatStoreMock.createSession.mockResolvedValue(createdSession);
    electronAPIMock.chatRuntimeSend.mockResolvedValueOnce({
      ok: false,
      code: 'ENOENT',
      error: `ENOENT: no such file or directory, stat '${missingFilePath}'`
    });
    const wrapper = mountBChat(null);
    await flushPromises();

    wrapper.findComponent(BTextEditorStub).vm.$emit('update:value', `read {{@${missingFilePath}}}`);
    await flushPromises();
    wrapper.findComponent(InputToolbarStub).vm.$emit('submit');
    await flushPromises();

    const visibleMessages = wrapper.findComponent(ConversationViewStub).props('messages') as Message[];
    expect(visibleMessages).toHaveLength(2);
    expect(visibleMessages[0]).toMatchObject({
      role: 'user',
      content: `read {{@${missingFilePath}}}`,
      parts: [{ type: 'text', text: `read {{@${missingFilePath}}}` }]
    });
    expect(visibleMessages[1]).toMatchObject({
      role: 'error',
      content: `文件不存在或已被移动：${missingFilePath}`,
      parts: [{ type: 'error', text: `文件不存在或已被移动：${missingFilePath}` }],
      loading: false,
      finished: true
    });
    expect(chatStoreMock.setSessionMessages).toHaveBeenCalledWith('session-created', [
      expect.objectContaining({ role: 'user', content: `read {{@${missingFilePath}}}` }),
      expect.objectContaining({ role: 'error', content: `文件不存在或已被移动：${missingFilePath}` })
    ]);
  });

  it('renders runtime error events as conversation error messages', async (): Promise<void> => {
    const wrapper = mountBChat('session-active');
    await flushPromises();

    emitRuntimeEvent(runtimeListeners, 'error', {
      runtimeId: 'runtime-1',
      sessionId: 'session-active',
      clientId: 'bchat',
      agentId: 'default',
      error: { code: 'REQUEST_FAILED', message: '模型调用失败' }
    });
    await flushPromises();

    const visibleMessages = wrapper.findComponent(ConversationViewStub).props('messages') as Message[];
    expect(visibleMessages).toHaveLength(1);
    expect(visibleMessages[0]).toMatchObject({
      role: 'error',
      content: '模型调用失败',
      parts: [{ type: 'error', text: '模型调用失败' }],
      loading: false,
      finished: true
    });
    expect(chatStoreMock.setSessionMessages).toHaveBeenCalledWith('session-active', [expect.objectContaining({ role: 'error', content: '模型调用失败' })]);
  });

  it('does not append a renderer-side interrupt message when aborting a chat runtime', async (): Promise<void> => {
    const wrapper = mountBChat('session-active');
    await flushPromises();

    wrapper.findComponent(BTextEditorStub).vm.$emit('update:value', 'stop me');
    await flushPromises();
    wrapper.findComponent(InputToolbarStub).vm.$emit('submit');
    await flushPromises();
    wrapper.findComponent(InputToolbarStub).vm.$emit('abort');
    await flushPromises();

    expect(electronAPIMock.chatRuntimeAbort).toHaveBeenCalledWith({ runtimeId: 'runtime-1' });
    expect(chatStoreMock.addSessionMessage).not.toHaveBeenCalledWith('session-active', expect.objectContaining({ role: 'interrupt' }));
  });

  it('marks a pending question as cancelled and appends interrupt when aborting after runtime waits for user input', async (): Promise<void> => {
    const pendingToolPart: ChatMessageToolPart = {
      id: 'part0037',
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
      content: '需要补充信息',
      parts: [pendingToolPart],
      runtimeId: 'runtime-1',
      loading: false,
      finished: false
    });
    chatStoreMock.getSessionMessages.mockResolvedValueOnce([userMessage, assistantMessage]).mockResolvedValueOnce([]);
    const wrapper = mountBChat('session-active');
    await flushPromises();

    wrapper.findComponent(BTextEditorStub).vm.$emit('update:value', '下一轮');
    await flushPromises();
    wrapper.findComponent(InputToolbarStub).vm.$emit('submit');
    await flushPromises();
    emitRuntimeEvent(runtimeListeners, 'complete', {
      runtimeId: 'runtime-1',
      sessionId: 'session-active',
      clientId: 'bchat',
      agentId: 'default'
    });
    await flushPromises();
    wrapper.findComponent(InputToolbarStub).vm.$emit('abort');
    await flushPromises();

    const lastPersistCall = chatStoreMock.setSessionMessages.mock.calls.at(-1);
    expect(lastPersistCall?.[0]).toBe('session-active');
    const persistedMessages = lastPersistCall?.[1] ?? [];
    const persistedAssistant = persistedMessages.find((message) => message.id === 'assistant-choice');
    expect(persistedAssistant?.parts[0]).toMatchObject({
      type: 'tool',
      result: expect.objectContaining({ status: 'cancelled' })
    });
    expect(persistedMessages.at(-1)).toMatchObject({
      role: 'interrupt',
      content: '已中断',
      loading: false,
      finished: true
    });
    expect(electronAPIMock.chatRuntimeAbort).not.toHaveBeenCalled();
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
          parts: [{ id: 'part0038', type: 'text', text: 'streaming' }],
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
      id: 'part0039',
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

    wrapper.findComponent(ConversationViewStub).vm.$emit('submit', createUserChoiceSubmitAction(answer));
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

  it('sends runtime user message submit actions through main process ChatRuntime', async (): Promise<void> => {
    const resultPart: ChatMessageWidgetResultPart = {
      id: 'part0040',
      type: 'widget_result',
      sessionId: 'widget-session-1',
      widgetId: 'weather',
      submittedAt: '2026-07-01T00:00:00.000Z',
      result: {
        status: 'success',
        data: {
          city: '上海'
        }
      }
    };
    const userMessage: Message = {
      id: 'user-widget-result',
      role: 'user',
      content: '小组件提交结果',
      parts: [resultPart],
      createdAt: '2026-07-01T00:00:00.000Z',
      loading: false,
      finished: true
    };
    const wrapper = mountBChat('session-active');
    await flushPromises();

    wrapper.findComponent(ConversationViewStub).vm.$emit(
      'submit',
      createRuntimeUserMessageSubmitAction({
        userMessage,
        parts: [resultPart],
        errorMessage: '提交小组件结果失败'
      })
    );
    await flushPromises();

    expect(electronAPIMock.chatRuntimeSend).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-active',
        content: '小组件提交结果',
        userMessageId: 'user-widget-result',
        userMessageCreatedAt: '2026-07-01T00:00:00.000Z',
        parts: [resultPart]
      })
    );
  });

  it('persists message update submit actions against the latest visible message', async (): Promise<void> => {
    const firstWidgetPart = createWidgetPart('created');
    const secondWidgetPart: ChatMessageWidgetPart = {
      ...createWidgetPart('created'),
      id: 'widget-part-forecast',
      sessionId: 'widget-session-2',
      widgetId: 'forecast'
    };
    const firstToolPart = createOpenWidgetToolPartFromWidgetPart(firstWidgetPart);
    const secondToolPart = createOpenWidgetToolPartFromWidgetPart(secondWidgetPart);
    const assistantMessage = createAssistantMessage({
      id: 'assistant-widget',
      content: '',
      parts: [firstToolPart, secondToolPart]
    });
    const firstMountedWidgetPart = createWidgetPart('mounted', 31);
    const secondMountedWidgetPart: ChatMessageWidgetPart = {
      ...createWidgetPart('mounted', 32),
      id: 'widget-part-forecast',
      sessionId: 'widget-session-2',
      widgetId: 'forecast'
    };
    const firstMountedToolPart = createOpenWidgetToolPartFromWidgetPart(firstMountedWidgetPart);
    const secondMountedToolPart = createOpenWidgetToolPartFromWidgetPart(secondMountedWidgetPart);
    chatStoreMock.getSessionMessages.mockResolvedValueOnce([assistantMessage]).mockResolvedValueOnce([]);
    const wrapper = mountBChat('session-active');
    await flushPromises();

    wrapper.findComponent(ConversationViewStub).vm.$emit(
      'submit',
      createMessageUpdateSubmitAction('assistant-widget', (currentMessage) => ({
        ...currentMessage,
        parts: currentMessage.parts.map((part, index) => (index === 0 ? firstMountedToolPart : part))
      }))
    );
    wrapper.findComponent(ConversationViewStub).vm.$emit(
      'submit',
      createMessageUpdateSubmitAction('assistant-widget', (currentMessage) => ({
        ...currentMessage,
        parts: currentMessage.parts.map((part, index) => (index === 1 ? secondMountedToolPart : part))
      }))
    );
    await flushPromises();

    const nextAssistantMessage: Message = {
      ...assistantMessage,
      parts: [firstMountedToolPart, secondMountedToolPart]
    };
    const visibleMessages = wrapper.findComponent(ConversationViewStub).props('messages') as Message[];
    expect(visibleMessages[0]).toEqual(nextAssistantMessage);
    expect(chatStoreMock.updateSessionMessage).toHaveBeenCalledWith('session-active', nextAssistantMessage);
  });

  it('submits cancelled user choices while the chat task is waiting for the answer', async (): Promise<void> => {
    const wrapper = mountBChat('session-active');
    await flushPromises();
    wrapper.findComponent(BTextEditorStub).vm.$emit('update:value', '需要选择');
    await flushPromises();
    wrapper.findComponent(InputToolbarStub).vm.$emit('submit');
    await flushPromises();
    const answer: AIUserChoiceAnswerData = {
      questionId: 'question-1',
      toolCallId: 'tool-call-1',
      answers: [],
      questionAnswers: [],
      otherText: ''
    };

    wrapper.findComponent(ConversationViewStub).vm.$emit('submit', createUserChoiceSubmitAction(answer));
    await flushPromises();

    expect(electronAPIMock.chatRuntimeSubmitUserChoice).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-active',
        answer
      })
    );
  });

  it('regenerates assistant messages through main process ChatRuntime', async (): Promise<void> => {
    const userMessage = createMessage('user-regenerate', '重新回答');
    const assistantMessage = createAssistantMessage({
      id: 'assistant-old',
      content: '旧回答',
      parts: [{ id: 'part0041', type: 'text', text: '旧回答' }]
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

    wrapper.findComponent(BTextEditorStub).vm.$emit('update:value', 'hello after long history');
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

    wrapper.findComponent(BTextEditorStub).vm.$emit('update:value', 'use tools');
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

    wrapper.findComponent(BTextEditorStub).vm.$emit('update:value', 'hello');
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

    wrapper.findComponent(BTextEditorStub).vm.$emit('slash-command', {
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

  it('highlights the input container while dragging files over the chat container', async (): Promise<void> => {
    const wrapper = mountBChat(null);
    await flushPromises();
    const chatContainer = wrapper.find('.b-chat__container');
    const inputContainer = wrapper.find('.b-chat__input-container');

    await chatContainer.element.dispatchEvent(createFileDragEvent('dragenter', [new File(['hello'], 'note.md', { type: 'text/markdown' })]));
    await wrapper.vm.$nextTick();

    expect(inputContainer.classes()).toContain('b-chat__input-container--dragover');

    await chatContainer.element.dispatchEvent(createFileDragEvent('dragleave', [new File(['hello'], 'note.md', { type: 'text/markdown' })]));
    await wrapper.vm.$nextTick();

    expect(inputContainer.classes()).not.toContain('b-chat__input-container--dragover');
  });

  it('inserts file reference tokens when non-image files are dropped on the chat container', async (): Promise<void> => {
    const wrapper = mountBChat(null);
    await flushPromises();

    await wrapper.find('.b-chat__container').element.dispatchEvent(createFileDragEvent('drop', [new File(['hello'], 'note.md', { type: 'text/markdown' })]));
    await flushPromises();

    expect(promptEditorMockState.insertTextAtCursor).toHaveBeenCalledWith('{{@/workspace/My Notes/note.md}}');
  });

  it('adds image files when images are dropped on the chat container', async (): Promise<void> => {
    const wrapper = mountBChat(null);
    await flushPromises();

    await wrapper.find('.b-chat__container').element.dispatchEvent(createFileDragEvent('drop', [new File(['image'], 'photo.png', { type: 'image/png' })]));
    await flushPromises();

    expect(promptEditorMockState.insertTextAtCursor).not.toHaveBeenCalled();
  });

  it('processes mixed dropped files with image upload and file reference insertion', async (): Promise<void> => {
    const wrapper = mountBChat(null);
    await flushPromises();

    await wrapper
      .find('.b-chat__container')
      .element.dispatchEvent(
        createFileDragEvent('drop', [new File(['image'], 'photo.png', { type: 'image/png' }), new File(['hello'], 'note.md', { type: 'text/markdown' })])
      );
    await flushPromises();

    expect(promptEditorMockState.insertTextAtCursor).toHaveBeenCalledWith('{{@/workspace/My Notes/note.md}}');
  });

  it('falls back to filename token when dropped file path cannot be resolved', async (): Promise<void> => {
    getPathForFileMock.mockReturnValue(null);
    const wrapper = mountBChat(null);
    await flushPromises();

    await wrapper.find('.b-chat__container').element.dispatchEvent(createFileDragEvent('drop', [new File(['hello'], 'note.md', { type: 'text/markdown' })]));
    await flushPromises();

    expect(promptEditorMockState.insertTextAtCursor).toHaveBeenCalledWith('{{@note.md}}');
  });

  it('clears input drag state without duplicate processing when an inner editor already handled the drop', async (): Promise<void> => {
    const wrapper = mountBChat(null);
    await flushPromises();
    const chatContainer = wrapper.find('.b-chat__container');
    const inputContainer = wrapper.find('.b-chat__input-container');

    await chatContainer.element.dispatchEvent(createFileDragEvent('dragenter', [new File(['hello'], 'note.md', { type: 'text/markdown' })]));
    await wrapper.vm.$nextTick();

    const dropEvent = createFileDragEvent('drop', [new File(['hello'], 'note.md', { type: 'text/markdown' })]);
    dropEvent.preventDefault();
    await chatContainer.element.dispatchEvent(dropEvent);
    await flushPromises();

    expect(inputContainer.classes()).not.toContain('b-chat__input-container--dragover');
    expect(promptEditorMockState.insertTextAtCursor).not.toHaveBeenCalled();
  });
});
