<template>
  <BubblePart type="tool-activity" has-content :default-collapsed="false">
    <template #title>
      <Icon :icon="iconName" width="14" height="14" :class="bem('icon', { running })" />
      <span :class="bem('title')">{{ title }}</span>
      <span v-if="statusText" :class="bem('status', { failure: isFailure })">{{ statusText }}</span>
    </template>

    <div :class="bem('summary')">{{ summaryText }}</div>
    <pre v-if="shellOutputText" :class="bem('shell-output')">{{ shellOutputText }}</pre>
  </BubblePart>
</template>

<script setup lang="ts">
/**
 * @file BubblePartToolActivity.vue
 * @description 聊天工具活动摘要组件，将内部工具调用转换为用户可理解的进度与结果。
 */
import type { ChatMessageToolCallPart, ChatMessageToolInputPart, ChatMessageToolResultPart } from 'types/chat';
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import { createNamespace } from '@/utils/namespace';
import BubblePart from './BubblePart.vue';

defineOptions({ name: 'BubblePartToolActivity' });

/** 可展示为工具活动摘要的消息片段。 */
type ToolActivityPart = ChatMessageToolInputPart | ChatMessageToolCallPart | ChatMessageToolResultPart;

interface Props {
  /** 工具活动片段 */
  part: ToolActivityPart;
  /** 对应工具调用的输入参数，用于兼容旧格式结果展示 */
  toolCallInput?: unknown;
}

const props = defineProps<Props>();
const [, bem] = createNamespace('', 'message-bubble-tool-activity');

/** 工具活动用户可读标签。 */
interface ToolActionLabel {
  /** 展示给用户的工具别名 */
  alias: string;
  /** 执行中状态文案 */
  running: string;
  /** 成功完成状态文案 */
  success: string;
}

/** 内置工具对应的用户可读动作文案。 */
const TOOL_ACTION_LABELS: Record<string, ToolActionLabel> = {
  question: { alias: '提问', running: '正在准备问题', success: '' },
  ask_user_question: { alias: '提问', running: '正在准备问题', success: '' },
  ask_user_choice: { alias: '选择', running: '正在准备选项', success: '' },
  read_current_document: { alias: '', running: '文档读取中', success: '文档读取完成' },
  read_file: { alias: '文件读取', running: '正在读取文件', success: '文件读取完成' },
  read_directory: { alias: '目录读取', running: '正在读取目录', success: '目录读取完成' },
  write_file: { alias: '文件写入', running: '正在写入文件', success: '文件写入完成' },
  edit_file: { alias: '文件修改', running: '正在修改文件', success: '文件修改完成' },
  get_current_time: { alias: '时间获取', running: '正在获取时间', success: '时间获取完成' },
  query_logs: { alias: '日志查询', running: '正在查询日志', success: '日志查询完成' },
  get_settings: { alias: '设置读取', running: '正在读取设置', success: '设置读取完成' },
  update_settings: { alias: '', running: '正在修改设置', success: '设置修改完成' },
  get_mcp_settings: { alias: 'MCP 设置读取', running: '正在读取 MCP 设置', success: 'MCP 设置读取完成' },
  add_mcp_server: { alias: 'MCP 服务添加', running: '正在添加 MCP 服务', success: 'MCP 服务添加完成' },
  update_mcp_server: { alias: 'MCP 服务更新', running: '正在更新 MCP 服务', success: 'MCP 服务更新完成' },
  remove_mcp_server: { alias: 'MCP 服务移除', running: '正在移除 MCP 服务', success: 'MCP 服务移除完成' },
  refresh_mcp_discovery: { alias: 'MCP 发现刷新', running: '正在刷新 MCP 发现', success: 'MCP 发现刷新完成' },
  run_shell_command: { alias: 'Shell 命令', running: '正在执行命令', success: '命令执行完成' },
  skill: { alias: 'Skill 加载', running: '正在加载 Skill', success: 'Skill 加载完成' },
  open_draft: { alias: '草稿打开', running: '正在打开草稿', success: '草稿已打开' },
  tavily_search: { alias: '网页搜索', running: '正在搜索网页', success: '网页搜索完成' },
  tavily_extract: { alias: '网页提取', running: '正在提取网页内容', success: '网页内容提取完成' }
};

/** 提问工具名称集合，兼容历史消息。 */
const QUESTION_TOOL_NAMES = new Set(['question', 'ask_user_question', 'ask_user_choice']);

/** Shell 命令工具名称。 */
const SHELL_COMMAND_TOOL_NAME = 'run_shell_command';

/** Shell 命令执行结果数据。 */
interface ShellCommandResultData {
  exitCode?: number | null;
  signal?: string | null;
  durationMs?: number;
  timedOut?: boolean;
  truncated?: boolean;
  stdout?: string;
  stderr?: string;
}

/**
 * 获取工具对应的用户可读动作。
 * @param toolName - 内部工具名称
 * @returns 用户可读动作文案
 */
function getActionLabel(toolName: string): ToolActionLabel {
  return TOOL_ACTION_LABELS[toolName] ?? { alias: '工具能力', running: '正在处理请求', success: '操作已完成' };
}

/**
 * 判断值是否为普通对象。
 * @param value - 待判断值
 * @returns 是否为普通对象
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 判断值是否为字符串数组。
 * @param value - 待判断值
 * @returns 是否为字符串数组
 */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * 格式化选项答案列表。
 * @param answers - 答案值列表
 * @returns 用户可读答案文案
 */
function formatAnswers(answers: string[]): string {
  return answers.length ? answers.join('、') : '未选择';
}

/**
 * 判断工具名是否为提问工具。
 * @param toolName - 工具名称
 * @returns 是否为提问工具
 */
function isQuestionToolName(toolName: string): boolean {
  return QUESTION_TOOL_NAMES.has(toolName);
}

/**
 * 格式化 Shell 命令执行结果摘要。
 * @param data - 工具结果数据
 * @returns 摘要文本
 */
function formatShellResultSummary(data: unknown): string {
  if (!isRecord(data)) {
    return '命令已执行。';
  }

  const result = data as ShellCommandResultData;
  const lines: string[] = [];

  if (result.exitCode === 0 || result.exitCode === null) {
    if (result.signal) {
      lines.push(`进程被信号 ${result.signal} 终止`);
    } else {
      lines.push('退出码 0');
    }
  } else {
    lines.push(`退出码 ${result.exitCode}`);
    if (result.stderr) {
      const stderrPreview = result.stderr.trimEnd().split('\n').slice(-2).join('\n').slice(0, 200);
      lines.push(`错误: ${stderrPreview}`);
    }
  }

  if (result.durationMs !== undefined) {
    lines.push(`耗时 ${result.durationMs < 1000 ? `${result.durationMs}ms` : `${(result.durationMs / 1000).toFixed(1)}s`}`);
  }

  if (result.truncated) {
    lines.push('输出已截断');
  }

  return lines.length ? lines.join(' · ') : '命令已执行。';
}

/**
 * 从提问工具结果中提取问题与答案摘要。
 * @param data - 工具结果数据
 * @param toolCallInput - 对应工具调用输入
 * @returns 摘要文本，不可解析时返回 null
 */
function formatQuestionResultSummary(data: unknown, toolCallInput?: unknown): string | null {
  if (!isRecord(data)) {
    return null;
  }

  const lines: string[] = [];
  const { questionAnswers } = data;
  if (Array.isArray(questionAnswers)) {
    questionAnswers.forEach((item) => {
      if (!isRecord(item) || typeof item.question !== 'string' || !isStringArray(item.answers)) {
        return;
      }

      lines.push(`问题：${item.question}`);
      lines.push(`回答：${formatAnswers(item.answers)}`);
    });
  }

  if (!lines.length && isStringArray(data.answers)) {
    if (isRecord(toolCallInput) && typeof toolCallInput.question === 'string') {
      lines.push(`问题：${toolCallInput.question}`);
    }
    lines.push(`回答：${formatAnswers(data.answers)}`);
  }

  if (typeof data.otherText === 'string' && data.otherText.trim()) {
    lines.push(`补充：${data.otherText.trim()}`);
  }

  return lines.length ? lines.join('\n') : null;
}

/** 当前执行结果片段。 */
const resultPart = computed<ChatMessageToolResultPart | null>(() => (props.part.type === 'tool-result' ? props.part : null));
/** 当前工具动作文案。 */
const actionLabel = computed(() => getActionLabel(props.part.toolName));
/** 工具是否仍在进行中。 */
const running = computed(() => props.part.type !== 'tool-result');
/** Shell 命令实时输出文本。 */
const shellOutputText = computed(() => {
  if (props.part.type !== 'tool-call' || !props.part.shellOutput?.length) {
    return '';
  }

  return props.part.shellOutput.map((chunk) => `[${chunk.stream}] ${chunk.text}`).join('');
});
/** 工具是否失败或取消。 */
const isFailure = computed(() => Boolean(resultPart.value && resultPart.value.result.status !== 'success'));
/** 标题文案。 */
const title = computed(() => {
  const result = resultPart.value?.result;

  if (!result) {
    return [actionLabel.value.alias, actionLabel.value.running].filter(Boolean).join('：');
  }

  if (result.status === 'success') {
    return [actionLabel.value.alias, actionLabel.value.success].filter(Boolean).join('：');
  }

  if (result.status === 'cancelled') {
    return `${actionLabel.value.alias}操作已取消`;
  }

  return `${actionLabel.value.alias}操作未完成`;
});
/** 状态标签文案。 */
const statusText = computed(() => {
  const result = resultPart.value?.result;
  if (!result) {
    return '';
  }

  if (result.status === 'success') {
    return '';
  }

  if (result.status === 'cancelled') {
    return '已取消';
  }

  return '失败';
});
/** 内容摘要文案。 */
const summaryText = computed(() => {
  const result = resultPart.value?.result;
  if (!result) {
    return '正在执行相关操作，请稍候。';
  }

  if (result.status === 'success') {
    if (isQuestionToolName(props.part.toolName)) {
      return formatQuestionResultSummary(result.data, props.toolCallInput) ?? '问题已提交。';
    }

    if (props.part.toolName === SHELL_COMMAND_TOOL_NAME) {
      return formatShellResultSummary(result.data);
    }

    return '已完成。';
  }

  return result.error?.message ?? '等待补充信息。';
});
/** 图标名称。 */
const iconName = computed(() => {
  const result = resultPart.value?.result;
  if (!result) {
    return 'lucide:loader-circle';
  }

  return result.status === 'success' ? 'lucide:check-circle-2' : 'lucide:circle-alert';
});
</script>

<style scoped lang="less">
.message-bubble-tool-activity__icon--running {
  animation: message-bubble-tool-activity-spin 1.2s linear infinite;
}

.message-bubble-tool-activity__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.message-bubble-tool-activity__status {
  flex-shrink: 0;
  color: var(--text-secondary);
}

.message-bubble-tool-activity__status--failure {
  color: var(--color-error);
}

.message-bubble-tool-activity__summary {
  line-height: 1.6;
  color: var(--text-secondary);
}

.message-bubble-tool-activity__shell-output {
  max-height: 180px;
  padding: 8px;
  margin: 8px 0 0;
  overflow: auto;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-primary);
  white-space: pre-wrap;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
}

@keyframes message-bubble-tool-activity-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}
</style>
