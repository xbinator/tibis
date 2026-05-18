/* eslint-disable vue/one-component-per-file */
/* @vitest-environment jsdom */
/**
 * @file voice-input-integration.test.ts
 * @description 验证聊天侧边栏对语音输入事件的集成处理。
 */
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BChatSidebar from '@/components/BChatSidebar/index.vue';

const {
  messageErrorMock,
  focusMock,
  saveCursorPositionMock,
  insertTextAtCursorMock,
  replaceTextRangeMock,
  getCursorPositionMock,
  removeToastMock,
  getSessionUsageMock,
  getSessionsMock,
  getSessionMessagesMock,
  createSessionMock,
  addSessionMessageMock,
  setSessionMessagesMock,
  setChatSidebarActiveSessionIdMock,
  setSidebarVisibleMock,
  streamMessagesMock,
  resolveServiceConfigMock,
  loadSelectedModelMock,
  onModelChangeMock
} = vi.hoisted(() => ({
  messageErrorMock: vi.fn(),
  focusMock: vi.fn(),
  saveCursorPositionMock: vi.fn(),
  insertTextAtCursorMock: vi.fn(),
  replaceTextRangeMock: vi.fn(),
  getCursorPositionMock: vi.fn(() => 3),
  removeToastMock: vi.fn(),
  getSessionUsageMock: vi.fn(async () => undefined),
  getSessionsMock: vi.fn(async () => ({ items: [] })),
  getSessionMessagesMock: vi.fn(async () => []),
  createSessionMock: vi.fn(async () => undefined),
  addSessionMessageMock: vi.fn(async () => undefined),
  setSessionMessagesMock: vi.fn(async () => undefined),
  setChatSidebarActiveSessionIdMock: vi.fn(),
  setSidebarVisibleMock: vi.fn(),
  streamMessagesMock: vi.fn(async () => undefined),
  resolveServiceConfigMock: vi.fn(async () => ({ providerId: 'provider-1', modelId: 'model-1', toolSupport: { supported: true } })),
  loadSelectedModelMock: vi.fn(async () => undefined),
  onModelChangeMock: vi.fn(async () => undefined)
}));

vi.mock('ant-design-vue', () => ({
  message: {
    error: messageErrorMock,
    success: vi.fn(),
    loading: vi.fn()
  }
}));

vi.mock('@/components/BPromptEditor/index.vue', async () => {
  const { defineComponent, h } = await import('vue');

  return {
    default: defineComponent({
      name: 'BPromptEditor',
      props: {
        value: {
          type: String,
          default: ''
        }
      },
      emits: ['change', 'submit', 'slash-command'],
      setup(props, { expose }) {
        expose({
          focus: focusMock,
          saveCursorPosition: saveCursorPositionMock,
          insertTextAtCursor: insertTextAtCursorMock,
          replaceTextRange: replaceTextRangeMock,
          getCursorPosition: getCursorPositionMock,
          getText: () => props.value
        });

        return () => h('div', { 'data-testid': 'prompt-editor-stub' }, props.value);
      }
    })
  };
});

vi.mock('@/components/BChatSidebar/components/InputToolbar.vue', async () => {
  const { defineComponent, h } = await import('vue');

  return {
    default: defineComponent({
      name: 'InputToolbar',
      emits: ['voice-start', 'voice-partial', 'voice-complete'],
      setup(_props, { emit }) {
        return () =>
          h('div', { 'data-testid': 'input-toolbar-stub' }, [
            h('button', { type: 'button', 'data-testid': 'voice-start-btn', onClick: () => emit('voice-start') }, 'start'),
            h(
              'button',
              {
                type: 'button',
                'data-testid': 'voice-partial-btn',
                onClick: () => emit('voice-partial', { text: '实时文本' })
              },
              'partial'
            ),
            h(
              'button',
              {
                type: 'button',
                'data-testid': 'voice-complete-btn',
                onClick: () => emit('voice-complete', { text: '最终文本' })
              },
              'complete'
            ),
            h(
              'button',
              {
                type: 'button',
                'data-testid': 'voice-empty-complete-btn',
                onClick: () => emit('voice-complete', { text: '   ' })
              },
              'empty-complete'
            )
          ]);
      }
    })
  };
});

vi.mock('@/components/BButton/index.vue', async () => {
  const { defineComponent, h } = await import('vue');

  return {
    default: defineComponent({
      name: 'BButton',
      emits: ['click'],
      setup(_props, { slots, emit }) {
        return () => h('button', { type: 'button', onClick: () => emit('click') }, slots.default?.());
      }
    })
  };
});

vi.mock('@/components/BModelSelect/index.vue', async () => {
  const { defineComponent, h } = await import('vue');

  return {
    default: defineComponent({
      name: 'BModelSelect',
      setup() {
        return () => h('div', { 'data-testid': 'global-model-select-stub' });
      }
    })
  };
});

vi.mock('@/components/BChatSidebar/components/ConversationView.vue', async () => {
  const { defineComponent, h } = await import('vue');

  return {
    default: defineComponent({
      name: 'ConversationView',
      setup(_props, { expose }) {
        expose({
          scrollToBottom: vi.fn()
        });

        return () => h('div', { 'data-testid': 'conversation-view-stub' });
      }
    })
  };
});

vi.mock('@/components/BChatSidebar/components/ImagePreview.vue', async () => {
  const { defineComponent, h } = await import('vue');

  return {
    default: defineComponent({
      name: 'ImagePreview',
      setup() {
        return () => h('div', { 'data-testid': 'image-preview-stub' });
      }
    })
  };
});

vi.mock('@/components/BChatSidebar/components/InteractionContainer/index.vue', async () => {
  const { defineComponent, h } = await import('vue');

  return {
    default: defineComponent({
      name: 'InteractionContainer',
      emits: ['remove-toast'],
      setup() {
        return () => h('div', { 'data-testid': 'interaction-container-stub' });
      }
    })
  };
});

vi.mock('@/components/BChatSidebar/components/SessionHistory.vue', async () => {
  const { defineComponent, h } = await import('vue');

  return {
    default: defineComponent({
      name: 'SessionHistory',
      emits: ['update:current-session', 'switch-session', 'delete-session'],
      setup() {
        return () => h('div', { 'data-testid': 'session-history-stub' });
      }
    })
  };
});

vi.mock('@/components/BChatSidebar/components/UsagePanel.vue', async () => {
  const { defineComponent, h } = await import('vue');

  return {
    default: defineComponent({
      name: 'UsagePanel',
      setup() {
        return () => h('div', { 'data-testid': 'usage-panel-stub' });
      }
    })
  };
});

vi.mock('@/components/BChatSidebar/hooks/useInteractionState', async () => {
  const { ref } = await import('vue');

  return {
    useInteractionState: () => ({
      toastQueue: ref([]),
      removeToast: removeToastMock
    })
  };
});

vi.mock('@/stores/chat', () => ({
  useChatSessionStore: () => ({
    getSessionMessages: getSessionMessagesMock,
    getSessions: getSessionsMock,
    getSessionUsage: getSessionUsageMock,
    createSession: createSessionMock,
    addSessionMessage: addSessionMessageMock,
    setSessionMessages: setSessionMessagesMock
  })
}));

vi.mock('@/stores/files', () => ({
  useFilesStore: () => ({
    recentFiles: []
  })
}));

vi.mock('@/stores/setting', () => ({
  useSettingStore: () => ({
    chatSidebarActiveSessionId: 'session-voice',
    setChatSidebarActiveSessionId: setChatSidebarActiveSessionIdMock,
    setSidebarVisible: setSidebarVisibleMock
  })
}));

vi.mock('@/ai/tools/builtin', () => ({
  createBuiltinTools: () => []
}));

vi.mock('@/ai/tools/editor-context', () => ({
  editorToolContextRegistry: {
    set: vi.fn(),
    delete: vi.fn()
  }
}));

vi.mock('@/ai/tools/policy', () => ({
  getDefaultChatToolNames: () => []
}));

vi.mock('@/hooks/useNavigate', () => ({
  useNavigate: () => ({
    openFile: vi.fn()
  })
}));

vi.mock('@/components/BChatSidebar/hooks/useAutoName', () => ({
  useAutoName: () => ({
    generateSessionTitle: vi.fn(async () => undefined)
  })
}));

vi.mock('@/components/BChatSidebar/hooks/useChatHistory', async () => {
  const { ref } = await import('vue');

  return {
    useChatHistory: () => ({
      setLoadedMessages: vi.fn(),
      fetchAllPriorHistory: vi.fn(async () => []),
      messages: ref([]),
      hasMoreHistory: ref(false),
      loadHistory: vi.fn(async () => [])
    })
  };
});

vi.mock('@/components/BChatSidebar/hooks/useChatInput', async () => {
  const { ref } = await import('vue');

  return {
    useChatInput: () => ({
      inputContent: ref('abc'),
      inputImages: ref([]),
      clear: vi.fn(),
      addImages: vi.fn(),
      removeImage: vi.fn(),
      restoreFromMessage: vi.fn(),
      isEmpty: () => false,
      hasImages: () => false
    })
  };
});

vi.mock('@/components/BChatSidebar/hooks/useChatStream', async () => {
  const { ref } = await import('vue');

  return {
    useChatStream: () => ({
      loading: ref(false),
      abort: vi.fn(),
      createUserMessage: vi.fn(),
      streamMessages: streamMessagesMock,
      submitUserChoice: vi.fn(async () => undefined),
      submitConfirmationAction: vi.fn(async () => undefined),
      cancelConfirmation: vi.fn()
    })
  };
});

vi.mock('@/components/BChatSidebar/hooks/useChatTaskRuntime', async () => {
  const { ref } = await import('vue');

  return {
    useChatTaskRuntime: () => ({
      loading: ref(false),
      beginTask: vi.fn(() => ({ ok: true })),
      finishTask: vi.fn(),
      abortActiveTask: vi.fn(),
      dispose: vi.fn()
    })
  };
});

vi.mock('@/components/BChatSidebar/hooks/useCompactContext', () => ({
  useCompactContext: () => ({
    maybeCompactBeforeSend: vi.fn(async () => undefined)
  })
}));

vi.mock('@/components/BChatSidebar/hooks/useFileReference', () => ({
  useFileReference: () => ({
    onPasteFiles: vi.fn(async () => undefined)
  })
}));

vi.mock('@/components/BChatSidebar/hooks/useImageUpload', () => ({
  useImageUpload: () => ({
    onPasteImages: vi.fn(async () => undefined),
    canAcceptImages: vi.fn(() => true),
    appendImages: vi.fn()
  })
}));

vi.mock('@/components/BChatSidebar/hooks/useModelSelection', async () => {
  const { ref } = await import('vue');

  return {
    useModelSelection: () => ({
      selectedModel: ref({ providerId: 'provider-1', modelId: 'model-1' }),
      supportsVision: ref(false),
      loadSelectedModel: loadSelectedModelMock,
      onModelChange: onModelChangeMock,
      resolveSelectedModelConfig: resolveServiceConfigMock
    })
  };
});

vi.mock('@/components/BChatSidebar/hooks/useSession', async () => {
  const { ref } = await import('vue');

  return {
    useSession: () => ({
      currentSession: ref({ id: 'session-voice', title: '语音测试会话' }),
      createNewSession: vi.fn(),
      switchSession: vi.fn(async () => undefined),
      ensureSession: vi.fn(async () => 'session-voice'),
      initializeActiveSession: vi.fn(),
      handleDeleteSession: vi.fn(async () => undefined)
    })
  };
});

vi.mock('@/components/BChatSidebar/hooks/useSlashCommands', () => ({
  useSlashCommands: () => ({
    handleSlashCommand: vi.fn(async () => undefined)
  }),
  chatSlashCommands: []
}));

vi.mock('@/components/BChatSidebar/hooks/useUsagePanel', async () => {
  const { ref } = await import('vue');

  return {
    useUsagePanel: () => ({
      open: ref(false),
      loading: ref(false),
      usage: ref(undefined),
      error: ref(undefined),
      close: vi.fn()
    })
  };
});

vi.mock('@/components/BChatSidebar/utils/chipResolver', () => ({
  createFileRefChipResolver: () => vi.fn()
}));

vi.mock('@/components/BChatSidebar/utils/confirmationController', () => ({
  createChatConfirmationController: () => ({
    createAdapter: () => ({})
  })
}));

vi.mock('@/components/BChatSidebar/utils/messageHelper', () => ({
  create: vi.fn(),
  userChoice: {
    findPending: vi.fn(() => null)
  },
  buildMessageReferences: vi.fn(() => [])
}));

describe('BChatSidebar voice integration', () => {
  beforeEach(() => {
    focusMock.mockClear();
    saveCursorPositionMock.mockClear();
    insertTextAtCursorMock.mockClear();
    replaceTextRangeMock.mockClear();
    getCursorPositionMock.mockClear();
    getCursorPositionMock.mockReturnValue(3);
    loadSelectedModelMock.mockClear();
    onModelChangeMock.mockClear();
    messageErrorMock.mockClear();
  });

  it('replaces the same prompt editor range across voice start, partial, and complete events', async () => {
    const wrapper = mount(BChatSidebar);

    await wrapper.get('[data-testid="voice-start-btn"]').trigger('click');
    expect(saveCursorPositionMock).toHaveBeenCalledTimes(1);
    expect(getCursorPositionMock).toHaveBeenCalledTimes(1);

    await wrapper.get('[data-testid="voice-partial-btn"]').trigger('click');
    expect(replaceTextRangeMock).toHaveBeenNthCalledWith(1, 3, 3, '实时文本');

    await wrapper.get('[data-testid="voice-complete-btn"]').trigger('click');
    expect(replaceTextRangeMock).toHaveBeenNthCalledWith(2, 3, 7, '最终文本');
    expect(insertTextAtCursorMock).not.toHaveBeenCalled();
  });

  it('clears the active voice placeholder and reports an error when the final transcript is empty', async () => {
    const wrapper = mount(BChatSidebar);

    await wrapper.get('[data-testid="voice-start-btn"]').trigger('click');
    await wrapper.get('[data-testid="voice-partial-btn"]').trigger('click');
    await wrapper.get('[data-testid="voice-empty-complete-btn"]').trigger('click');

    expect(replaceTextRangeMock).toHaveBeenNthCalledWith(1, 3, 3, '实时文本');
    expect(replaceTextRangeMock).toHaveBeenNthCalledWith(2, 3, 7, '');
    expect(messageErrorMock).toHaveBeenCalledWith('语音转写结果为空，请重试');
    expect(insertTextAtCursorMock).not.toHaveBeenCalled();
  });
});
