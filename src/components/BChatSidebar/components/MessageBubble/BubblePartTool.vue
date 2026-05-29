/** * @file BubblePartTool.vue * @description 聊天消息中工具调用部分的气泡组件，展示工具的执行状态、输入/输出内容， * 以及提问工具（ask_user_choice
等）的问答结果 */
<template>
  <!-- 工具气泡容器：inputting 状态默认展开，其余状态默认折叠 -->
  <BubblePart type="tool" :has-content="hasContent" :default-collapsed="defaultCollapsed">
    <template #title>
      <!-- 状态图标：inputting 旋转、executing 扳手、done 成功/失败 -->
      <BIcon :icon="icon" :class="bem('icon', { spin: part.status === 'inputting' })" :size="14" />
      <!-- 工具名称（文件操作时显示路径，其余显示别名） -->
      <BTruncateText :class="bem('name')" :text="title" />
      <!-- 执行失败状态标签 -->
      <span v-if="part.status === 'done' && part.result?.status === 'failure'" :class="bem('status', { failure: true })">失败</span>
    </template>

    <!-- 提问工具成功结果：以问答形式展示用户选择 -->
    <template v-if="isQuestionSuccess">
      <div :class="bem('result')">
        <div v-for="(item, index) in qaItems" :key="index" :class="bem('result-item')">
          <div :class="bem('result-label')">{{ item.question }}</div>
          <div :class="bem('result-tags')">
            <span v-for="label in item.selectedLabels" :key="label" :class="bem('result-tag')">{{ label }}</span>
          </div>
        </div>
        <!-- 用户填写的补充信息 -->
        <div v-if="questionOtherText" :class="bem('result-item')">
          <div :class="bem('result-label')">是否有更多的补充信息需要提供？（可选）</div>
          <div :class="bem('result-tags')">
            <span :class="bem('result-tag')">{{ questionOtherText }}</span>
          </div>
        </div>
      </div>
    </template>
    <!-- 非提问工具：展示代码格式的输入/输出内容 -->
    <BubblePartToolCode v-else-if="hasContent" :value="previewValue" />
  </BubblePart>
</template>

<script setup lang="ts">
import type { AIUserChoiceAnswerData, AIUserChoiceQuestionAnswer, ChatMessageToolPart } from 'types/chat';
import { computed } from 'vue';
import type { QuestionItemInput, QuestionToolInput } from '@/ai/tools/builtin/QuestionTool';
import { createNamespace } from '@/utils/namespace';
import { hasStructuredValueContent } from '../../utils/messagePart';
import { getActionLabel } from '../../utils/toolLabels';
import BubblePart from './BubblePart.vue';
import BubblePartToolCode from './BubblePartToolCode.vue';

defineOptions({ name: 'BubblePartTool' });

/** 工具调用部分的 props */
interface Props {
  /** 工具调用的消息片段数据 */
  part: ChatMessageToolPart;
}

const props = withDefaults(defineProps<Props>(), {});

const [, bem] = createNamespace('', 'bubble-part-tool');

/** 工具状态与图标的映射：inputting 旋转加载、executing 扳手、done 成功/失败 */
const ICON_MAP = {
  inputting: 'lucide:loader-circle',
  executing: 'lucide:wrench',
  done: { success: 'lucide:check-circle-2', failure: 'lucide:circle-alert', cancelled: 'lucide:circle-x' }
} as const;

/** 提问类工具名称集合，用于判断是否展示问答结果视图 */
const QUESTION_TOOL_NAMES = new Set(['ask_user_choice', 'ask_user_question', 'question']);

// ─── 提问工具结果解析 ─────────────────────────────────────────────────

/** 问答展示项：包含问题文本和用户选择的标签列表 */
interface QaItem {
  /** 问题文本 */
  question: string;
  /** 用户选择的选项标签列表 */
  selectedLabels: string[];
}

/**
 * 解析提问工具的输入，统一为 QuestionItemInput 数组
 * 兼容单问题（question）和多问题（questions）两种输入格式
 * @param input - 提问工具的输入参数
 * @returns 标准化后的问题列表
 */
function resolveQaQuestions(input: QuestionToolInput): QuestionItemInput[] {
  if (input.questions?.length) return input.questions;
  if (input.question) return [{ question: input.question, mode: input.mode ?? 'single', options: input.options ?? [] }];
  return [];
}

/**
 * 将用户选择的 value 值解析为可读的 label 标签
 * @param questions - 问题列表（包含 options 定义）
 * @param questionText - 当前问题文本
 * @param values - 用户选择的 value 值数组
 * @returns 对应的 label 标签数组，找不到匹配时回退为原始 value
 */
function resolveQaLabels(questions: QuestionItemInput[], questionText: string, values: string[]): string[] {
  const matched = questions.find((q) => q.question === questionText);
  if (!matched?.options?.length) return values;
  return values.map((v) => matched.options.find((o) => o.value === v)?.label ?? v);
}

// ─── 组件逻辑 ────────────────────────────────────────────────────────

/** 根据工具执行状态计算显示的图标 */
const icon = computed(() => {
  const { status } = props.part;
  if (status === 'done') {
    return ICON_MAP.done[(props.part.result?.status as keyof typeof ICON_MAP.done) ?? 'failure'];
  }
  return ICON_MAP[status];
});

/** 非 inputting 状态默认折叠，inputting 时展开让用户看到实时输入 */
const defaultCollapsed = computed(() => props.part.status !== 'inputting');

/** 工具标题：文件操作显示文件路径，其余显示工具别名 */
const title = computed(() => {
  const { part } = props;
  const { alias } = getActionLabel(part.toolName);

  if (part.toolName === 'write_file' || part.toolName === 'edit_file') {
    const path = (part.input as Record<string, unknown>)?.path;

    if (typeof path === 'string') return path;
  }

  return alias;
});

/**
 * 获取 inputting 状态下的预览值
 * write_file 工具优先展示 content 字段，其余工具展示完整 input 或 inputText
 * @param part - 工具消息片段
 * @returns 预览内容
 */
function getInputtingValue(part: ChatMessageToolPart) {
  if (!part.input) return part.inputText ?? '';
  const { content } = part.input as { content: string };
  if (part.toolName === 'write_file' && typeof content !== 'undefined') return content;
  return part.input ?? part.inputText;
}

/** 根据工具状态计算预览内容：inputting 取输入值、executing 取输入、done 取结果 */
const previewValue = computed(() => {
  const { part } = props;
  if (part.status === 'inputting') return getInputtingValue(part);
  if (part.status === 'executing') return part.input;
  return part.result;
});

/** 判断是否有可展示的内容，done 状态始终有内容，其余状态需检查结构化值 */
const hasContent = computed(() => {
  if (props.part.status === 'done') return true;
  return hasStructuredValueContent(previewValue.value);
});

/** 判断是否为提问工具且执行成功，用于切换问答结果视图 */
const isQuestionSuccess = computed(
  () => props.part.status === 'done' && props.part.result?.status === 'success' && QUESTION_TOOL_NAMES.has(props.part.toolName)
);

/**
 * 解析提问工具的问答结果，将 value 映射为可读的 label
 * 兼容多问题（questionAnswers）和单问题（answers）两种返回格式
 */
const qaItems = computed<QaItem[]>(() => {
  if (!isQuestionSuccess.value) return [];
  const input = props.part.input as QuestionToolInput;
  const answer = props.part.result!.data as AIUserChoiceAnswerData;
  const questions = resolveQaQuestions(input);
  const answers = answer.questionAnswers ?? [];
  // 多问题模式：逐条映射 questionAnswers
  if (answers.length > 0) {
    return answers.map((qa: AIUserChoiceQuestionAnswer) => ({
      question: qa.question,
      selectedLabels: resolveQaLabels(questions, qa.question, qa.answers)
    }));
  }
  // 单问题模式：使用第一个问题 + 顶层 answers
  const firstQuestion = questions[0];
  if (!firstQuestion) return [];
  return [{ question: firstQuestion.question, selectedLabels: resolveQaLabels(questions, firstQuestion.question, answer.answers) }];
});

/** 提问工具中用户填写的补充信息文本 */
const questionOtherText = computed(() => {
  if (!isQuestionSuccess.value) return undefined;
  return (props.part.result!.data as AIUserChoiceAnswerData).otherText;
});
</script>

<style scoped lang="less">
.bubble-part-tool__icon {
  flex-shrink: 0;

  &--spin {
    animation: bubble-part-tool-spin 1.2s linear infinite;
  }
}

@keyframes bubble-part-tool-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

.bubble-part-tool__name {
  flex: 1;
  width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bubble-part-tool__status--failure {
  margin-left: 8px;
  color: var(--color-error);
}

.bubble-part-tool__result {
  font-size: 12px;
  line-height: 1.6;
}

.bubble-part-tool__result-item + .bubble-part-tool__result-item {
  padding-top: 8px;
  margin-top: 8px;
  border-top: 1px dashed var(--border-primary);
}

.bubble-part-tool__result-label {
  font-weight: 500;
  color: var(--text-primary);
}

.bubble-part-tool__result-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.bubble-part-tool__result-tag {
  padding: 1px 6px;
  color: var(--color-primary);
  background: var(--color-primary-bg, rgb(22 119 255 / 8%));
  border-radius: 4px;
}
</style>
