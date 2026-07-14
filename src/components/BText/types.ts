/**
 * @file types.ts
 * @description BTextEditor 共享类型定义
 */
import type { ChipResolver } from './extensions/variableChip';
import type { MethodAction } from '@/components/BWidget/utils/widgetMethods';

/**
 * 图片粘贴/拖拽接管上下文。
 */
export interface PasteImageContext {
  /** 纯文本内容 */
  text?: string;
  /** HTML 内容 */
  html?: string;
  /** 图片文件列表 */
  imageFiles: File[];
  /** 其他文件列表 */
  otherFiles: File[];
}

/**
 * 斜杠命令选项元数据
 */
export type SlashCommandId = 'model' | 'usage' | 'new' | 'clear' | 'compact';

/**
 * 斜杠命令类型
 */
export type SlashCommandType = 'action' | 'prompt';

/**
 * 斜杠命令选项元数据，供提示词编辑器和聊天侧边栏使用
 */
export interface SlashCommandOption {
  /** 稳定的命令标识符 */
  id: SlashCommandId;
  /** 展示给用户的斜杠触发文本 */
  trigger: string;
  /** 人类可读的命令标题 */
  title: string;
  /** 在 UI 提示中显示的命令描述 */
  description: string;
  /** 命令类型；action 命令立即执行，prompt 命令打开提示词流程 */
  type: SlashCommandType;
}

/**
 * 变量定义
 */
export interface Variable {
  /** 变量说明标签，无说明时为空字符串 */
  label: string;
  /** 变量值（插入到 {{ }} 中间） */
  value: string;
  /** 变量描述（可选） */
  description?: string;
  /** 子级变量选项，用于表达对象变量的层级结构 */
  children?: Variable[];
}

/**
 * 变量选项分组
 */
export interface VariableOptionGroup {
  /** 分组选项类型 */
  type: 'variable';
  /** 当前类型下的变量选项 */
  options: Variable[];
}

/**
 * BTextSelect 支持的静态选项值。
 */
export type BTextSelectStaticValue = string | number | boolean | null;

/**
 * BTextSelect 模型值，字符串也可表示完整变量模板。
 */
export type BTextSelectValue = BTextSelectStaticValue | undefined;

/**
 * BTextSelect 静态选项。
 */
export interface BTextSelectOption {
  /** 展示文本 */
  label: string;
  /** 实际写入值 */
  value: BTextSelectStaticValue;
  /** 选项说明 */
  description?: string;
}

/** 方法动作配置。 */
export type BTextMethodAction = MethodAction;

/**
 * 可选方法。
 */
export interface BTextMethodOption {
  /** 展示文本 */
  label: string;
  /** 实际方法名 */
  value: string;
  /** 方法参数名 */
  parameters?: string[];
  /** 方法说明 */
  description?: string;
}

/**
 * 文件提及选项，用于 @ 文件查找功能
 */
export interface FileMentionOption {
  /** 文件唯一标识 */
  id: string;
  /** 文件名（含扩展名） */
  name: string;
  /** 文件路径，未保存文件为 null */
  path: string | null;
  /** 文件扩展名 */
  ext: string;
}

/**
 * BTextEditor 组件属性
 */
export interface BTextEditorProps {
  /** 占位符 */
  placeholder?: string;
  /** 变量选项 */
  options?: VariableOptionGroup[];
  /** 暴露给编辑器的斜杠命令元数据 */
  slashCommands?: SlashCommandOption[];
  /** 文件提及选项列表，用于 @ 文件查找 */
  fileMentions?: FileMentionOption[];
  /** 是否禁用 */
  disabled?: boolean;
  /** 最大高度 */
  maxHeight?: number | string;
  /** 是否在按下 Enter 时提交（Shift+Enter 换行） */
  submitOnEnter?: boolean;
  /** Chip 解析器，由消费者提供 */
  chipResolver?: ChipResolver;
  /** 文件粘贴回调 */
  onPasteFiles?: (files: File[]) => Promise<string | null> | string | null;
  /** 图片粘贴/拖拽接管回调 */
  onPasteImages?: (context: PasteImageContext) => Promise<void> | void;
  /** 当前是否允许接收图片 */
  canAcceptImages?: () => boolean;
  /** ESC 键取消回调，用于中止流式输出等场景 */
  onCancel?: () => void;
}

/**
 * BTextEditor 对外暴露的方法。
 */
export interface BTextEditorExpose {
  /** 聚焦编辑器，可选移动到末尾 */
  focus: (options?: { moveToEnd?: boolean }) => void;
  /** 读取当前光标位置 */
  getCursorPosition: () => number;
  /** 保存当前光标位置 */
  saveCursorPosition: () => void;
  /** 在当前光标位置插入文本 */
  insertTextAtCursor: (text: string) => void;
  /** 替换指定文本范围 */
  replaceTextRange: (from: number, to: number, text: string) => void;
  /** 读取编辑器文本 */
  getText: () => string;
}
