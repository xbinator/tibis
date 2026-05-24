/**
 * @file useSlashCommands.ts
 * @description 斜杠命令处理 hook，统一管理命令定义和派发逻辑。
 */
import type { SlashCommandOption } from '@/components/BPromptEditor/types';

/**
 * 斜杠命令处理所需的回调函数集合。
 */
type CommandHandlers = {
  /** 打开模型选择器 */
  openModelSelector: () => Promise<void> | void;
  /** 打开用量面板 */
  openUsagePanel: () => Promise<void> | void;
  /** 创建新会话 */
  createNewSession: () => Promise<void> | void;
  /** 清空输入 */
  clearInput: () => Promise<void> | void;
  /** 压缩上下文 */
  compactContext: () => Promise<void> | void;
  /** 当前是否有活跃任务 */
  isBusy: () => boolean;
  /** 命令因忙碌被拒绝时的回调 */
  onBusyCommandRejected?: (commandId: string) => void;
};

/**
 * 命令并发策略。
 */
type CommandConcurrencyPolicy = 'allowAlways' | 'allowWhenIdleOnly';

/**
 * 命令 id → handler 键名的映射表，作为单一数据源。
 * 新增命令时只需在此处添加一条记录，UI 列表与派发逻辑均自动同步。
 * `satisfies` 确保每个 handler 键名都真实存在于 CommandHandlers，写错时编译器立即报错。
 */
const COMMAND_HANDLER_MAP = {
  model: 'openModelSelector',
  usage: 'openUsagePanel',
  new: 'createNewSession',
  clear: 'clearInput',
  compact: 'compactContext'
} as const satisfies Record<string, keyof CommandHandlers>;

/** 从映射表键名派生的命令 id 联合类型 */
type CommandId = keyof typeof COMMAND_HANDLER_MAP;

/**
 * 聊天侧边栏斜杠命令定义，供 UI 展示使用。
 * trigger 由 id 自动生成，避免重复维护。
 */
const CHAT_COMMAND_DEFINITIONS = [
  { id: 'model', title: '模型', description: '切换当前使用的模型', concurrencyPolicy: 'allowAlways' },
  { id: 'usage', title: '使用情况', description: '显示当前会话的 token 使用情况', concurrencyPolicy: 'allowAlways' },
  { id: 'new', title: '新建聊天', description: '开始一个新的聊天会话', concurrencyPolicy: 'allowWhenIdleOnly' },
  { id: 'compact', title: '压缩上下文', description: '立即执行一次手动上下文压缩', concurrencyPolicy: 'allowWhenIdleOnly' }
] satisfies Array<{ id: CommandId; title: string; description: string; concurrencyPolicy: CommandConcurrencyPolicy }>;

/**
 * 聊天侧边栏斜杠命令定义，供 UI 展示使用。
 */
export const chatSlashCommands: SlashCommandOption[] = CHAT_COMMAND_DEFINITIONS.map(({ id, title, description }) => ({
  id,
  trigger: `/${id}`,
  title,
  description,
  type: 'action' as const
}));

/**
 * 斜杠命令处理 hook
 * @param handlers - 命令处理所需的回调函数
 * @returns 命令处理器
 */
export function useSlashCommands(handlers: CommandHandlers) {
  /**
   * 处理斜杠命令，通过映射表将命令 id 派发到对应回调。
   * 相较于 switch-case，映射表查找为 O(1)，且新增命令无需修改此函数。
   * `?.()` 兜底防止未知 id 导致运行时崩溃。
   * @param command - 斜杠命令项
   */
  async function handleSlashCommand({ id }: SlashCommandOption): Promise<void> {
    const handlerKey = COMMAND_HANDLER_MAP[id as CommandId];
    const command = CHAT_COMMAND_DEFINITIONS.find((item) => item.id === id);
    if (!handlerKey || !command) {
      return;
    }

    if (command.concurrencyPolicy === 'allowWhenIdleOnly' && handlers.isBusy()) {
      handlers.onBusyCommandRejected?.(id);
      return;
    }

    await handlers[handlerKey]?.();
  }

  return { handleSlashCommand };
}
