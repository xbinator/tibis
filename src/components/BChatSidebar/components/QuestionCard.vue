<template>
  <div class="choice-card">
    <!-- 第一步：选择答案 -->
    <div v-show="currentStep === 0" class="choice-card__step">
      <div v-for="(item, questionIndex) in questionItems" :key="`${question.questionId}-${questionIndex}`" class="choice-card__question">
        <div class="choice-card__title">{{ item.question }}</div>

        <div class="choice-card__options">
          <label v-for="option in item.options" :key="option.value" class="choice-card__option" :class="{ 'choice-card__option--disabled': disabled }">
            <div class="choice-card__option-input">
              <input
                :type="getInputType(item)"
                :name="`${question.questionId}-${questionIndex}`"
                :value="option.value"
                :checked="getSelectedValues(questionIndex).includes(option.value)"
                :disabled="disabled || isOptionDisabled(questionIndex, option.value)"
                @change="handleOptionChange(questionIndex, option.value, ($event.target as HTMLInputElement).checked)"
              />
            </div>
            <span class="choice-card__option-main">
              <span>{{ option.label }}</span>
              <small v-if="option.description">{{ option.description }}</small>
            </span>
          </label>
        </div>
      </div>

      <div v-if="!disabled" class="choice-card__footer">
        <BButton size="small" :disabled="!canSubmit" @click="handleNext">下一步</BButton>
      </div>
    </div>

    <!-- 第二步：补充信息 -->
    <div v-show="currentStep === 1" class="choice-card__step">
      <div class="choice-card__title">是否有更多的补充信息需要提供？（可选）</div>

      <input v-model="otherText" class="choice-card__other" type="text" placeholder="请输入补充信息..." :disabled="disabled" />

      <div v-if="!disabled" class="choice-card__footer">
        <BButton size="small" type="secondary" @click="handlePrev">上一步</BButton>
        <BButton size="small" @click="handleSubmit">提交</BButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @file QuestionCard.vue
 * @description 渲染 question 等待态工具结果，两步步骤条形式。
 * 第一步：展示 LLM 返回的一个或多个问题选项
 * 第二步：固定问题"是否有更多的补充信息需要提供？（可选）"+ 输入框
 */
import type { AIAwaitingUserChoiceItem, AIAwaitingUserChoiceQuestion } from 'types/ai';
import type { AIUserChoiceAnswerData } from 'types/chat';
import { computed, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    /** 等待用户回答的问题 */
    question: AIAwaitingUserChoiceQuestion;
    /** 会话已结束时禁用交互 */
    disabled?: boolean;
  }>(),
  { disabled: false }
);

const emit = defineEmits<{
  /** 用户提交选择答案 */
  (e: 'submit-choice', answer: AIUserChoiceAnswerData): void;
}>();

const selectedValuesByQuestion = ref<string[][]>([]);
const otherText = ref('');
const currentStep = ref(0);

const questionItems = computed<AIAwaitingUserChoiceItem[]>(() => props.question.questions ?? [props.question]);
const canSubmit = computed(() => selectedValuesByQuestion.value.some((selectedValues) => selectedValues.length > 0));

watch(
  questionItems,
  (items) => {
    selectedValuesByQuestion.value = items.map((_, index) => selectedValuesByQuestion.value[index] ?? []);
  },
  { immediate: true }
);

/**
 * 获取问题选项输入类型。
 * @param item - 等待用户回答的单个问题
 * @returns HTML 输入类型
 */
function getInputType(item: AIAwaitingUserChoiceItem): 'checkbox' | 'radio' {
  return item.mode === 'multiple' ? 'checkbox' : 'radio';
}

/**
 * 获取指定问题当前选中的值。
 * @param questionIndex - 问题下标
 * @returns 当前问题的选中值列表
 */
function getSelectedValues(questionIndex: number): string[] {
  return selectedValuesByQuestion.value[questionIndex] ?? [];
}

/**
 * 根据选择模式更新选中值。
 * @param value - 选项值
 * @param checked - 是否选中
 */
function handleOptionChange(questionIndex: number, value: string, checked: boolean): void {
  const item = questionItems.value[questionIndex];
  if (!item) {
    return;
  }

  const currentValues = getSelectedValues(questionIndex);
  if (item.mode === 'single') {
    selectedValuesByQuestion.value[questionIndex] = checked ? [value] : [];
    return;
  }

  if (!checked) {
    selectedValuesByQuestion.value[questionIndex] = currentValues.filter((selectedValue) => selectedValue !== value);
    return;
  }

  if (currentValues.includes(value)) {
    return;
  }

  const maxSelections = item.maxSelections ?? item.options.length;
  if (currentValues.length >= maxSelections) {
    return;
  }

  selectedValuesByQuestion.value[questionIndex] = [...currentValues, value];
}

/**
 * 判断选项是否因多选上限而不可再选。
 * @param value - 选项值
 */
function isOptionDisabled(questionIndex: number, value: string): boolean {
  const item = questionItems.value[questionIndex];
  const currentValues = getSelectedValues(questionIndex);
  if (!item || item.mode !== 'multiple' || currentValues.includes(value)) {
    return false;
  }

  const maxSelections = item.maxSelections ?? item.options.length;
  return currentValues.length >= maxSelections;
}

/**
 * 进入下一步
 */
function handleNext(): void {
  if (!canSubmit.value) {
    return;
  }
  currentStep.value = 1;
}

/**
 * 返回上一步
 */
function handlePrev(): void {
  currentStep.value = 0;
}

/**
 * 提交当前用户答案。
 */
function handleSubmit(): void {
  const questionAnswers = questionItems.value.map((item, index) => ({
    question: item.question,
    answers: [...getSelectedValues(index)]
  }));

  emit('submit-choice', {
    questionId: props.question.questionId,
    toolCallId: props.question.toolCallId,
    answers: questionAnswers[0]?.answers ?? [],
    questionAnswers,
    otherText: otherText.value.trim()
  });
}
</script>

<style scoped lang="less">
.choice-card {
  padding: 12px;
  font-size: 13px;
  color: var(--text-primary);
  background: var(--bg-secondary);
  border: 1px solid var(--border-primary);
  border-radius: 10px;
}

.choice-card__step {
  margin-top: 0;
}

.choice-card__question + .choice-card__question {
  padding-top: 12px;
  margin-top: 12px;
  border-top: 1px solid var(--border-primary);
}

.choice-card__title {
  margin-bottom: 10px;
  font-weight: 600;
}

.choice-card__options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.choice-card__option-input {
  display: flex;
  align-items: center;
  height: 20px;
}

.choice-card__option {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  cursor: pointer;
}

.choice-card__option-main {
  display: flex;
  flex-direction: column;
  gap: 2px;

  small {
    color: var(--text-secondary);
  }
}

.choice-card__other {
  width: 100%;
  padding: 7px 9px;
  color: var(--text-primary);
  outline: none;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
}

.choice-card__footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 10px;
}
</style>
