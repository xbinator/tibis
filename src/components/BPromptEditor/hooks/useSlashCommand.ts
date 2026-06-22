/**
 * @file useSlashCommand.ts
 * @description 斜杠命令 Hook，管理 /命令 的状态、过滤和选择逻辑
 */
import type { SlashCommandOption } from '../types';
import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { computed, ref, type Ref, type ComputedRef, type ShallowRef } from 'vue';

/**
 * useSlashCommand 返回类型
 */
export interface UseSlashCommandReturn {
  /** 是否显示斜杠命令菜单 */
  slashVisible: Ref<boolean>;
  /** 当前高亮索引 */
  slashActiveIndex: Ref<number>;
  /** 当前活动项是否需要滚动到可视区 */
  slashShouldScrollActive: Ref<boolean>;
  /** 过滤后的命令列表 */
  filteredSlashCommands: ComputedRef<readonly SlashCommandOption[]>;
  /** 当前活动范围 */
  slashRange: Ref<{ from: number; to: number } | null>;

  /** 从编辑器状态同步菜单状态 */
  syncSlashCommandState: (state: EditorState, editorView: EditorView | null) => void;
  /** 关闭菜单 */
  closeSlashCommandMenu: (suppressSync?: boolean) => void;
  /** 处理选择 */
  handleSlashCommandSelect: (command: SlashCommandOption) => void;
  /** 处理索引变化 */
  handleSlashActiveIndexChange: (index: number) => void;
  /** 键盘导航 - 上 */
  handleSlashCommandArrowUp: () => boolean;
  /** 键盘导航 - 下 */
  handleSlashCommandArrowDown: () => boolean;
  /** 键盘确认 */
  handleSlashCommandEnter: () => boolean;
}

/**
 * 斜杠命令 Hook
 * @param view - EditorView 引用
 * @param slashCommands - 斜杠命令列表
 * @param emit - 事件发射函数
 */
export function useSlashCommand(
  view: ShallowRef<EditorView | null>,
  slashCommands: ComputedRef<readonly SlashCommandOption[]>,
  emit: (event: 'slash-command', command: SlashCommandOption) => void
): UseSlashCommandReturn {
  // 状态
  const slashVisible = ref(false);
  const slashActiveIndex = ref(0);
  const slashShouldScrollActive = ref(false);
  const slashQuery = ref('');
  const slashRange = ref<{ from: number; to: number } | null>(null);
  const suppressSlashSync = ref(false);

  // 过滤后的命令列表
  const filteredSlashCommands = computed<readonly SlashCommandOption[]>(() => {
    const query = slashQuery.value.toLowerCase();
    if (!query) return slashCommands.value;
    return slashCommands.value.filter((command) => command.trigger.toLowerCase().startsWith(`/${query}`));
  });

  /**
   * 判断斜杠命令是否匹配当前查询前缀
   */
  function isSlashCommandMatch(command: SlashCommandOption, query: string): boolean {
    return command.trigger.toLowerCase().startsWith(`/${query.toLowerCase()}`);
  }

  /**
   * 获取光标位置处的当前斜杠命令上下文
   */
  function getSlashCommandContext(state: EditorState): { from: number; to: number; query: string } | null {
    if (slashCommands.value.length === 0) {
      return null;
    }

    const selection = state.selection.main;
    if (!selection.empty) {
      return null;
    }

    const pos = selection.head;
    const line = state.doc.lineAt(pos);
    const text = state.sliceDoc(line.from, pos);

    if (!text.startsWith('/')) {
      return null;
    }

    const query = text.slice(1);
    const matches = slashCommands.value.filter((command) => isSlashCommandMatch(command, query));

    if (matches.length === 0) {
      return null;
    }

    return {
      from: line.from,
      to: pos,
      query
    };
  }

  /**
   * 关闭斜杠命令菜单
   */
  function closeSlashCommandMenu(suppressSync = false): void {
    if (suppressSync) {
      suppressSlashSync.value = true;
    }
    slashVisible.value = false;
    slashShouldScrollActive.value = false;
    slashQuery.value = '';
    slashRange.value = null;
  }

  /**
   * 从编辑器内容同步斜杠命令菜单状态
   */
  function syncSlashCommandState(state: EditorState, editorView: EditorView | null): void {
    if (!editorView) {
      closeSlashCommandMenu();
      return;
    }

    if (suppressSlashSync.value) {
      suppressSlashSync.value = false;
      closeSlashCommandMenu();
      return;
    }

    const context = getSlashCommandContext(state);
    if (!context) {
      closeSlashCommandMenu();
      return;
    }

    slashVisible.value = true;
    slashQuery.value = context.query;
    slashRange.value = { from: context.from, to: context.to };
    slashShouldScrollActive.value = false;
    slashActiveIndex.value = 0;
  }

  /**
   * 更新高亮斜杠命令索引，并记录是否需要滚动到可视区。
   * @param index - 新的高亮索引
   * @param shouldScrollActive - 是否需要滚动当前活动项
   */
  function updateSlashActiveIndex(index: number, shouldScrollActive: boolean): void {
    slashShouldScrollActive.value = shouldScrollActive;
    slashActiveIndex.value = index;
  }

  /**
   * 更新高亮斜杠命令的索引
   */
  function handleSlashActiveIndexChange(index: number): void {
    updateSlashActiveIndex(index, false);
  }

  /**
   * 应用选中的斜杠命令并清除活动斜杠文本
   */
  function handleSlashCommandSelect(command: SlashCommandOption): void {
    if (!view.value || !slashRange.value) return;

    const { from, to } = slashRange.value;
    view.value.dispatch({
      changes: { from, to, insert: '' },
      selection: { anchor: from }
    });

    emit('slash-command', command);
    closeSlashCommandMenu();
    view.value.focus();
  }

  /**
   * 选择当前高亮的斜杠命令
   */
  function handleSlashCommandEnter(): boolean {
    const command = filteredSlashCommands.value[slashActiveIndex.value];
    if (!command) {
      return false;
    }

    handleSlashCommandSelect(command);
    return true;
  }

  /**
   * 向上移动斜杠命令高亮
   */
  function handleSlashCommandArrowUp(): boolean {
    const list = filteredSlashCommands.value;
    if (!slashVisible.value) return false;
    if (list.length === 0) return true;

    const newIndex = (slashActiveIndex.value - 1 + list.length) % list.length;
    updateSlashActiveIndex(newIndex, true);
    return true;
  }

  /**
   * 向下移动斜杠命令高亮
   */
  function handleSlashCommandArrowDown(): boolean {
    const list = filteredSlashCommands.value;
    if (!slashVisible.value) return false;
    if (list.length === 0) return true;

    const newIndex = (slashActiveIndex.value + 1) % list.length;
    updateSlashActiveIndex(newIndex, true);
    return true;
  }

  return {
    slashVisible,
    slashActiveIndex,
    slashShouldScrollActive,
    filteredSlashCommands,
    slashRange,
    syncSlashCommandState,
    closeSlashCommandMenu,
    handleSlashCommandSelect,
    handleSlashActiveIndexChange,
    handleSlashCommandArrowUp,
    handleSlashCommandArrowDown,
    handleSlashCommandEnter
  };
}
