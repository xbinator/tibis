<template>
  <div class="choice-card">
    <!-- 第一步：选择答案 -->
    <div v-show="currentStep === 0" class="choice-card__step">
      <div class="choice-card__title">{{ question.question }}</div>

      <div class="choice-card__options">
        <label v-for="option in question.options" :key="option.value" class="choice-card__option">
          <div class="choice-card__option-input">
            <input
              :type="inputType"
              :value="option.value"
              :checked="selectedValues.includes(option.value)"
              :disabled="isOptionDisabled(option.value)"
              @change="handleOptionChange(option.value, ($event.target as HTMLInputElement).checked)"
            />
          </div>
          <span class="choice-card__option-main">
            <span>{{ option.label }}</span>
            <small v-if="option.description">{{ option.description }}</small>
          </span>
        </label>
      </div>

      <div class="choice-card__footer">
        <BButton size="small" :disabled="!canSubmit" @click="handleNext">下一步</BButton>
      </div>
    </div>

    <!-- 第二步：补充信息 -->
    <div v-show="currentStep === 1" class="choice-card__step">
      <div class="choice-card__title">是否有更多的补充信息需要提供？（可选）</div>

      <input v-model="otherText" class="choice-card__other" type="text" placeholder="请输入补充信息..." />

      <div class="choice-card__footer">
        <BButton size="small" type="secondary" @click="handlePrev">上一步</BButton>
        <BButton size="small" @click="handleSubmit">提交</BButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @file AskUserChoiceCard.vue
 * @description 渲染 ask_user_question 等待态工具结果，两步步骤条形式。
 * 第一步：展示 LLM 返回的问题选项
 * 第二步：固定问题"是否有更多的补充信息需要提供？（可选）"+ 输入框
 */
import type { AIAwaitingUserChoiceQuestion } from 'types/ai';
import type { AIUserChoiceAnswerData } from 'types/chat';
import { computed, ref } from 'vue';

const props = defineProps<{
  /** 等待用户回答的问题 */
  question: AIAwaitingUserChoiceQuestion;
}>();

const emit = defineEmits<{
  /** 用户提交选择答案 */
  (e: 'submit-choice', answer: AIUserChoiceAnswerData): void;
}>();

const selectedValues = ref<string[]>([]);
const otherText = ref('');
const currentStep = ref(0);

const inputType = computed(() => (props.question.mode === 'multiple' ? 'checkbox' : 'radio'));
const canSubmit = computed(() => selectedValues.value.length > 0);

/**
 * 根据选择模式更新选中值。
 * @param value - 选项值
 * @param checked - 是否选中
 */
function handleOptionChange(value: string, checked: boolean): void {
  if (props.question.mode === 'single') {
    selectedValues.value = checked ? [value] : [];
    return;
  }

  if (!checked) {
    selectedValues.value = selectedValues.value.filter((item) => item !== value);
    return;
  }

  if (selectedValues.value.includes(value)) {
    return;
  }

  const maxSelections = props.question.maxSelections ?? props.question.options.length;
  if (selectedValues.value.length >= maxSelections) {
    return;
  }

  selectedValues.value = [...selectedValues.value, value];
}

/**
 * 判断选项是否因多选上限而不可再选。
 * @param value - 选项值
 */
function isOptionDisabled(value: string): boolean {
  if (props.question.mode !== 'multiple' || selectedValues.value.includes(value)) {
    return false;
  }

  const maxSelections = props.question.maxSelections ?? props.question.options.length;
  return selectedValues.value.length >= maxSelections;
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
  emit('submit-choice', {
    questionId: props.question.questionId,
    toolCallId: props.question.toolCallId,
    answers: [...selectedValues.value],
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
