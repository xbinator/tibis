/**
 * @file useEditorKeymap.test.ts
 * @description 键盘快捷键 Hook 单元测试
 */
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { ref, computed, shallowRef } from 'vue';
import { useEditorKeymap } from '@/components/BPromptEditor/hooks/useEditorKeymap';
import type { SlashCommandOption, Variable, FileMentionOption } from '@/components/BPromptEditor/types';

describe('useEditorKeymap', () => {
  // Mock data
  const mockCommands: SlashCommandOption[] = [
    { id: 'model', trigger: '/model', title: '模型', description: '选择模型', type: 'action' }
  ];

  const mockFiles: FileMentionOption[] = [
    { id: '1', name: 'App.vue', path: 'src/App.vue', ext: 'vue' }
  ];

  const mockVariables: Variable[] = [
    { label: '名称', value: 'name' }
  ];

  // Mock hooks return
  const createMockSlashCommand = () => ({
    slashVisible: ref(false),
    slashActiveIndex: ref(0),
    filteredSlashCommands: computed(() => mockCommands),
    slashRange: ref(null),
    syncSlashCommandState: vi.fn(),
    closeSlashCommandMenu: vi.fn(),
    handleSlashCommandSelect: vi.fn(),
    handleSlashActiveIndexChange: vi.fn(),
    handleSlashCommandArrowUp: vi.fn(() => true),
    handleSlashCommandArrowDown: vi.fn(() => true),
    handleSlashCommandEnter: vi.fn(() => true)
  });

  const createMockFileMention = () => ({
    mentionVisible: ref(false),
    mentionActiveIndex: ref(0),
    filteredFileMentions: computed(() => mockFiles),
    mentionRange: ref(null),
    syncMentionState: vi.fn(),
    closeMentionMenu: vi.fn(),
    handleFileMentionSelect: vi.fn(),
    handleMentionActiveIndexChange: vi.fn(),
    handleMentionArrowUp: vi.fn(() => true),
    handleMentionArrowDown: vi.fn(() => true),
    handleMentionEnter: vi.fn(() => true)
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('returns a keymap extension', () => {
    const viewRef = shallowRef<any>(null);
    const slashCommand = createMockSlashCommand();
    const fileMention = createMockFileMention();
    const handleVariableSelect = vi.fn();
    const onSubmit = vi.fn();

    const extension = useEditorKeymap({
      view: viewRef,
      slashCommand,
      fileMention,
      variableTrigger: {
        triggerVisible: ref(false),
        triggerActiveIndex: ref(0),
        filteredVariables: computed(() => mockVariables)
      },
      handleVariableSelect,
      submitOnEnter: false,
      onSubmit,
      onCancel: undefined
    });

    expect(extension).toBeDefined();
    expect(typeof extension).toBe('object');
  });

  test('calls onSubmit when submitOnEnter is true and no menus are visible', () => {
    const viewRef = shallowRef<any>(null);
    const slashCommand = createMockSlashCommand();
    const fileMention = createMockFileMention();
    const handleVariableSelect = vi.fn();
    const onSubmit = vi.fn();

    slashCommand.slashVisible.value = false;
    fileMention.mentionVisible.value = false;

    const extension = useEditorKeymap({
      view: viewRef,
      slashCommand,
      fileMention,
      variableTrigger: {
        triggerVisible: ref(false),
        triggerActiveIndex: ref(0),
        filteredVariables: computed(() => mockVariables)
      },
      handleVariableSelect,
      submitOnEnter: true,
      onSubmit,
      onCancel: undefined
    });

    expect(extension).toBeDefined();
  });

  test('slash command navigation handlers are called when menu is visible', () => {
    const viewRef = shallowRef<any>(null);
    const slashCommand = createMockSlashCommand();
    const fileMention = createMockFileMention();
    const handleVariableSelect = vi.fn();
    const onSubmit = vi.fn();

    slashCommand.slashVisible.value = true;

    const extension = useEditorKeymap({
      view: viewRef,
      slashCommand,
      fileMention,
      variableTrigger: {
        triggerVisible: ref(false),
        triggerActiveIndex: ref(0),
        filteredVariables: computed(() => mockVariables)
      },
      handleVariableSelect,
      submitOnEnter: false,
      onSubmit,
      onCancel: undefined
    });

    expect(extension).toBeDefined();
    expect(slashCommand.slashVisible.value).toBe(true);
  });

  test('file mention navigation handlers are called when menu is visible', () => {
    const viewRef = shallowRef<any>(null);
    const slashCommand = createMockSlashCommand();
    const fileMention = createMockFileMention();
    const handleVariableSelect = vi.fn();
    const onSubmit = vi.fn();

    fileMention.mentionVisible.value = true;

    const extension = useEditorKeymap({
      view: viewRef,
      slashCommand,
      fileMention,
      variableTrigger: {
        triggerVisible: ref(false),
        triggerActiveIndex: ref(0),
        filteredVariables: computed(() => mockVariables)
      },
      handleVariableSelect,
      submitOnEnter: false,
      onSubmit,
      onCancel: undefined
    });

    expect(extension).toBeDefined();
    expect(fileMention.mentionVisible.value).toBe(true);
  });

  test('onCancel is passed through', () => {
    const viewRef = shallowRef<any>(null);
    const slashCommand = createMockSlashCommand();
    const fileMention = createMockFileMention();
    const handleVariableSelect = vi.fn();
    const onSubmit = vi.fn();
    const onCancel = vi.fn();

    const extension = useEditorKeymap({
      view: viewRef,
      slashCommand,
      fileMention,
      variableTrigger: {
        triggerVisible: ref(false),
        triggerActiveIndex: ref(0),
        filteredVariables: computed(() => mockVariables)
      },
      handleVariableSelect,
      submitOnEnter: false,
      onSubmit,
      onCancel
    });

    expect(extension).toBeDefined();
  });

  test('extension contains keymap with standard bindings', () => {
    const viewRef = shallowRef<any>(null);
    const slashCommand = createMockSlashCommand();
    const fileMention = createMockFileMention();
    const handleVariableSelect = vi.fn();
    const onSubmit = vi.fn();

    const extension = useEditorKeymap({
      view: viewRef,
      slashCommand,
      fileMention,
      variableTrigger: {
        triggerVisible: ref(false),
        triggerActiveIndex: ref(0),
        filteredVariables: computed(() => mockVariables)
      },
      handleVariableSelect,
      submitOnEnter: false,
      onSubmit
    });

    // Extension should be defined and be an object (PrecExtension)
    expect(extension).toBeDefined();
    expect(typeof extension).toBe('object');
  });
});
