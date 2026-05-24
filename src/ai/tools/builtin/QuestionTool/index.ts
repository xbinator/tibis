/**
 * @file QuestionTool/index.ts
 * @description Built-in executor for pausing tool flow until the user answers one or more questions.
 */
import type { AIChoiceOption, AIAwaitingUserChoiceItem, AIAwaitingUserChoiceQuestion, AIToolExecutor } from 'types/ai';
import { createAwaitingUserInputResult, createToolFailureResult } from '../../results';

/** Shared tool name constant. */
export const QUESTION_TOOL_NAME = 'question';

/** Legacy tool name kept only for reading historical conversation data. */
export const LEGACY_ASK_USER_QUESTION_TOOL_NAME = 'ask_user_question';

/** Maximum number of options accepted by the executor. */
const MAX_CHOICE_OPTIONS = 10;

/**
 * Single question input.
 */
export interface QuestionItemInput {
  /** Prompt shown to the user. */
  question: string;
  /** Selection mode. */
  mode: 'single' | 'multiple';
  /** Available options. */
  options: AIChoiceOption[];
  /** Maximum number of answers allowed in multiple mode. */
  maxSelections?: number;
}

/**
 * Question tool input.
 */
export interface QuestionToolInput {
  /** Prompt shown to the user for legacy single-question calls. */
  question?: string;
  /** Selection mode for legacy single-question calls. */
  mode?: 'single' | 'multiple';
  /** Available options for legacy single-question calls. */
  options?: AIChoiceOption[];
  /** Maximum number of answers allowed in multiple mode. */
  maxSelections?: number;
  /** Questions shown to the user in one tool call. */
  questions?: QuestionItemInput[];
}

/**
 * Pending question snapshot.
 */
export interface PendingQuestionSnapshot {
  /** Current pending question identifier. */
  questionId: string;
  /** Related tool call identifier. */
  toolCallId: string;
}

/**
 * Factory options for the question tool.
 */
export interface CreateQuestionToolOptions {
  /** Reads the current pending question, if one exists. */
  getPendingQuestion: () => PendingQuestionSnapshot | null;
  /** Creates a stable question identifier. */
  createQuestionId: () => string;
}

/**
 * Validates one choice option.
 * @param option - Option to validate.
 * @returns Whether the option has a usable label and value.
 */
function isValidChoiceOption(option: AIChoiceOption): boolean {
  return typeof option.label === 'string' && option.label.trim().length > 0 && typeof option.value === 'string' && option.value.trim().length > 0;
}

/**
 * Normalizes legacy single-question input and batch input to a question list.
 * @param input - Raw tool input.
 * @returns Question list, or null when input does not contain usable question shape.
 */
function normalizeQuestionInput(input: QuestionToolInput): QuestionItemInput[] | null {
  if (Array.isArray(input.questions)) {
    return input.questions;
  }

  if (typeof input.question === 'undefined' && typeof input.mode === 'undefined' && typeof input.options === 'undefined') {
    return null;
  }

  return [
    {
      question: input.question ?? '',
      mode: input.mode ?? ('single' as const),
      options: input.options ?? [],
      maxSelections: input.maxSelections
    }
  ];
}

/**
 * Validates one normalized question at execution time.
 * @param question - Question item.
 * @returns Validation error message, or null when valid.
 */
function validateQuestionItem(question: QuestionItemInput): string | null {
  if (typeof question.question !== 'string' || question.question.trim().length === 0) {
    return '问题内容不能为空。';
  }

  if (!Array.isArray(question.options) || question.options.length === 0) {
    return '至少需要提供一个可选项。';
  }

  if (question.options.length > MAX_CHOICE_OPTIONS) {
    return `可选项数量不能超过 ${MAX_CHOICE_OPTIONS} 个。`;
  }

  if (!question.options.every((option) => isValidChoiceOption(option))) {
    return '每个选项都必须提供非空的 label 和 value。';
  }

  if (question.mode !== 'single' && question.mode !== 'multiple') {
    return 'mode 只能是 single 或 multiple。';
  }

  if (question.mode === 'single') {
    if (typeof question.maxSelections !== 'undefined') {
      return '单选问题不能设置 maxSelections。';
    }

    return null;
  }

  if (typeof question.maxSelections !== 'undefined') {
    if (!Number.isInteger(question.maxSelections) || question.maxSelections < 1) {
      return '多选问题的 maxSelections 必须是大于 0 的整数。';
    }

    if (question.maxSelections > question.options.length) {
      return '多选问题的 maxSelections 不能超过可选项数量。';
    }
  }

  return null;
}

/**
 * Question tool validation result.
 */
type QuestionToolValidationResult = { valid: true; questions: QuestionItemInput[] } | { valid: false; error: string };

/**
 * Validates question tool input at execution time.
 * @param input - Raw tool input.
 * @returns Normalized questions and no error, or a validation error.
 */
function validateQuestionToolInput(input: QuestionToolInput): QuestionToolValidationResult {
  const questions = normalizeQuestionInput(input);

  if (!questions || questions.length === 0) {
    return { valid: false, error: '至少需要提供一个问题。' };
  }

  for (const question of questions) {
    const error = validateQuestionItem(question);
    if (error) {
      return { valid: false, error };
    }
  }

  return { valid: true, questions };
}

/**
 * Builds the awaiting-user-input payload.
 * @param questions - Validated questions.
 * @param questionId - Generated question identifier.
 * @returns Question payload sent through the terminal tool result.
 */
function createQuestionPayload(questions: QuestionItemInput[], questionId: string): AIAwaitingUserChoiceQuestion {
  const [firstQuestion] = questions;
  const normalizedQuestions: AIAwaitingUserChoiceItem[] = questions.map((question) => ({
    question: question.question,
    mode: question.mode,
    options: question.options,
    maxSelections: question.mode === 'multiple' ? question.maxSelections : undefined
  }));

  return {
    questionId,
    toolCallId: '',
    question: firstQuestion.question,
    mode: firstQuestion.mode,
    options: firstQuestion.options,
    maxSelections: firstQuestion.mode === 'multiple' ? firstQuestion.maxSelections : undefined,
    questions: normalizedQuestions
  };
}

/**
 * Creates the built-in question tool.
 * @param options - Factory dependencies.
 * @returns Configured read-only tool executor.
 */
export function createQuestionTool(options: CreateQuestionToolOptions): AIToolExecutor<QuestionToolInput, AIAwaitingUserChoiceQuestion> {
  return {
    definition: {
      name: QUESTION_TOOL_NAME,
      description: '向用户发起一个或多个单选/多选问题，并等待用户选择后继续。',
      source: 'builtin',
      riskLevel: 'read',
      permissionCategory: 'system',
      requiresActiveDocument: false,
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: '向用户展示的问题文本。' },
          mode: { type: 'string', enum: ['single', 'multiple'], description: '选择模式。' },
          options: {
            type: 'array',
            description: '可选项列表，最多 10 项。',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string', description: '显示给用户的文本。' },
                value: { type: 'string', description: '提交给模型的值。' },
                description: { type: 'string', description: '可选的补充说明。' }
              },
              required: ['label', 'value'],
              additionalProperties: false
            }
          },
          maxSelections: { type: 'number', description: '多选时允许选择的最大数量。' },
          questions: {
            type: 'array',
            description: '同一次工具调用展示的问题列表。',
            items: {
              type: 'object',
              properties: {
                question: { type: 'string', description: '向用户展示的问题文本。' },
                mode: { type: 'string', enum: ['single', 'multiple'], description: '选择模式。' },
                options: {
                  type: 'array',
                  description: '可选项列表，最多 10 项。',
                  items: {
                    type: 'object',
                    properties: {
                      label: { type: 'string', description: '显示给用户的文本。' },
                      value: { type: 'string', description: '提交给模型的值。' },
                      description: { type: 'string', description: '可选的补充说明。' }
                    },
                    required: ['label', 'value'],
                    additionalProperties: false
                  }
                },
                maxSelections: { type: 'number', description: '多选时允许选择的最大数量。' }
              },
              required: ['question', 'mode', 'options'],
              additionalProperties: false
            }
          }
        },
        required: [],
        additionalProperties: false
      }
    },
    async execute(input: QuestionToolInput) {
      if (options.getPendingQuestion()) {
        return createToolFailureResult(QUESTION_TOOL_NAME, 'EXECUTION_FAILED', '当前已有待回答问题，请等待用户先完成作答。');
      }

      const validationResult = validateQuestionToolInput(input);

      if (!validationResult.valid) {
        return createToolFailureResult(QUESTION_TOOL_NAME, 'INVALID_INPUT', validationResult.error);
      }

      return createAwaitingUserInputResult(QUESTION_TOOL_NAME, createQuestionPayload(validationResult.questions, options.createQuestionId()));
    }
  };
}
