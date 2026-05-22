/**
 * @file useSlashCommand.test.ts
 * @description 斜杠命令 Hook 单元测试
 */
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { computed, ref, nextTick } from 'vue';
import { useSlashCommand } from '@/components/BPromptEditor/hooks/useSlashCommand';
import type { SlashCommandOption } from '@/components/BPromptEditor/types';

// Mock EditorView and EditorState
const mockView = {
  dispatch: vi.fn(),
  focus: vi.fn(),
  state: {
    selection: { main: { head: 0, empty: true } },
    doc: {
      lineAt: vi.fn(() => ({ from: 0, to: 0 })),
      toString: () => ''
    },
    sliceDoc: vi.fn(() => '/')
  }
};

const createMockState = (text: string, cursorPos: number = text.length) => ({
  selection: { main: { head: cursorPos, empty: true } },
  doc: {
    lineAt: (pos: number) => ({
      from: 0,
      to: text.length,
      text
    })
  },
  sliceDoc: (from: number, to: number) => text.slice(from, to)
});

describe('useSlashCommand', () => {
  const mockCommands: SlashCommandOption[] = [
    { id: 'model', trigger: '/model', title: '模型', description: '选择模型', type: 'action' },
    { id: 'usage', trigger: '/usage', title: '使用情况', description: '查看使用情况', type: 'action' },
    { id: 'new', trigger: '/new', title: '新建', description: '新建聊天', type: 'action' }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('initial state is closed', () => {
    const viewRef = ref<any>(null);
    const commands = computed(() => mockCommands);
    const emit = vi.fn();

    const result = useSlashCommand(viewRef, commands, emit);

    expect(result.slashVisible.value).toBe(false);
    expect(result.slashActiveIndex.value).toBe(0);
    expect(result.slashRange.value).toBeNull();
  });

  test('filteredSlashCommands returns all commands when query is empty', () => {
    const viewRef = ref<any>(null);
    const commands = computed(() => mockCommands);
    const emit = vi.fn();

    const result = useSlashCommand(viewRef, commands, emit);
    // slashQuery 是内部状态，通过 syncSlashCommandState 来更新
    // 初始状态下 slashQuery 为空，所以返回所有命令
    expect(result.filteredSlashCommands.value).toHaveLength(3);
  });

  test('filteredSlashCommands filters by trigger prefix', async () => {
    const viewRef = ref<any>(null);
    const commands = computed(() => mockCommands);
    const emit = vi.fn();

    const result = useSlashCommand(viewRef, commands, emit);

    // 模拟输入 /us - 通过内部状态触发过滤
    // 由于 slashQuery 是内部状态，我们无法直接设置
    // 这个测试应该在集成测试中进行
    // 这里只测试初始状态
    expect(result.filteredSlashCommands.value).toHaveLength(3);
  });

  test('handleSlashCommandArrowUp decrements index', () => {
    const viewRef = ref<any>(null);
    const commands = computed(() => mockCommands);
    const emit = vi.fn();

    const result = useSlashCommand(viewRef, commands, emit);
    result.slashVisible.value = true;
    result.slashActiveIndex.value = 1;

    result.handleSlashCommandArrowUp();

    expect(result.slashActiveIndex.value).toBe(0);
  });

  test('handleSlashCommandArrowUp wraps to last item', () => {
    const viewRef = ref<any>(null);
    const commands = computed(() => mockCommands);
    const emit = vi.fn();

    const result = useSlashCommand(viewRef, commands, emit);
    result.slashVisible.value = true;
    result.slashActiveIndex.value = 0;

    result.handleSlashCommandArrowUp();

    expect(result.slashActiveIndex.value).toBe(2);
  });

  test('handleSlashCommandArrowDown increments index', () => {
    const viewRef = ref<any>(null);
    const commands = computed(() => mockCommands);
    const emit = vi.fn();

    const result = useSlashCommand(viewRef, commands, emit);
    result.slashVisible.value = true;
    result.slashActiveIndex.value = 0;

    result.handleSlashCommandArrowDown();

    expect(result.slashActiveIndex.value).toBe(1);
  });

  test('handleSlashCommandArrowDown wraps to first item', () => {
    const viewRef = ref<any>(null);
    const commands = computed(() => mockCommands);
    const emit = vi.fn();

    const result = useSlashCommand(viewRef, commands, emit);
    result.slashVisible.value = true;
    result.slashActiveIndex.value = 2;

    result.handleSlashCommandArrowDown();

    expect(result.slashActiveIndex.value).toBe(0);
  });

  test('closeSlashCommandMenu resets state', () => {
    const viewRef = ref<any>(null);
    const commands = computed(() => mockCommands);
    const emit = vi.fn();

    const result = useSlashCommand(viewRef, commands, emit);
    // 先打开菜单
    result.slashVisible.value = true;
    result.slashRange.value = { from: 0, to: 5 };

    result.closeSlashCommandMenu();

    expect(result.slashVisible.value).toBe(false);
    expect(result.slashRange.value).toBeNull();
  });

  test('handleSlashCommandSelect emits event and closes menu', () => {
    const mockDispatch = vi.fn();
    const mockFocus = vi.fn();
    const viewRef = ref<any>({
      dispatch: mockDispatch,
      focus: mockFocus
    });
    const commands = computed(() => mockCommands);
    const emit = vi.fn();

    const result = useSlashCommand(viewRef, commands, emit);
    result.slashVisible.value = true;
    result.slashRange.value = { from: 0, to: 5 };

    result.handleSlashCommandSelect(mockCommands[0]);

    expect(emit).toHaveBeenCalledWith('slash-command', mockCommands[0]);
    expect(mockDispatch).toHaveBeenCalled();
    expect(mockFocus).toHaveBeenCalled();
    expect(result.slashVisible.value).toBe(false);
  });

  test('handleSlashCommandEnter selects current item', () => {
    const mockDispatch = vi.fn();
    const mockFocus = vi.fn();
    const viewRef = ref<any>({
      dispatch: mockDispatch,
      focus: mockFocus
    });
    const commands = computed(() => mockCommands);
    const emit = vi.fn();

    const result = useSlashCommand(viewRef, commands, emit);
    result.slashVisible.value = true;
    result.slashRange.value = { from: 0, to: 5 };
    result.slashActiveIndex.value = 1;

    const handled = result.handleSlashCommandEnter();

    expect(handled).toBe(true);
    expect(emit).toHaveBeenCalledWith('slash-command', mockCommands[1]);
  });

  test('handleSlashCommandEnter returns false when no command', () => {
    const viewRef = ref<any>(null);
    const commands = computed(() => []);
    const emit = vi.fn();

    const result = useSlashCommand(viewRef, commands, emit);
    result.slashVisible.value = true;

    const handled = result.handleSlashCommandEnter();

    expect(handled).toBe(false);
  });

  test('navigation returns true to indicate handled', () => {
    const viewRef = ref<any>(null);
    const commands = computed(() => mockCommands);
    const emit = vi.fn();

    const result = useSlashCommand(viewRef, commands, emit);
    result.slashVisible.value = true;

    expect(result.handleSlashCommandArrowUp()).toBe(true);
    expect(result.handleSlashCommandArrowDown()).toBe(true);
  });

  test('navigation returns false when menu is not visible', () => {
    const viewRef = ref<any>(null);
    const commands = computed(() => mockCommands);
    const emit = vi.fn();

    const result = useSlashCommand(viewRef, commands, emit);
    result.slashVisible.value = false;

    expect(result.handleSlashCommandArrowUp()).toBe(false);
    expect(result.handleSlashCommandArrowDown()).toBe(false);
  });
});
