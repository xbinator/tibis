/**
 * @file question-card.component.test.ts
 * @description 问题卡片组件挂载测试。
 */
/* @vitest-environment jsdom */

import type { AIAwaitingUserChoiceQuestion } from 'types/ai';
import { nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import QuestionCard from '@/components/BChatSidebar/components/QuestionCard.vue';

/**
 * 创建用户选择问题。
 * @param overrides - 覆盖字段
 * @returns 用户选择问题
 */
function createQuestion(overrides: Partial<AIAwaitingUserChoiceQuestion> = {}): AIAwaitingUserChoiceQuestion {
  return {
    questionId: 'question-1',
    toolCallId: 'tool-call-1',
    mode: 'single',
    question: '请选择渠道',
    options: [
      { label: '官网', value: 'official' },
      { label: '短视频', value: 'video' }
    ],
    ...overrides
  };
}

/**
 * 挂载问题卡片。
 * @param question - 用户选择问题
 * @returns 挂载结果
 */
function mountQuestionCard(question: AIAwaitingUserChoiceQuestion): VueWrapper {
  return mount(QuestionCard, {
    props: { question },
    global: {
      stubs: {
        BButton: {
          emits: ['click'],
          template: '<button type="button" @click="$emit(\'click\', $event)"><slot /></button>'
        }
      }
    }
  });
}

describe('QuestionCard', () => {
  it('emits a single selected answer', async () => {
    const wrapper = mountQuestionCard(createQuestion());

    await wrapper.find('input[value="official"]').setValue(true);
    await wrapper.findAll('button')[0].trigger('click');
    await wrapper.findAll('button').at(-1)?.trigger('click');

    expect(wrapper.emitted('submit-choice')).toEqual([
      [{
        questionId: 'question-1',
        toolCallId: 'tool-call-1',
        answers: ['official'],
        questionAnswers: [
          {
            question: '请选择渠道',
            answers: ['official']
          }
        ],
        otherText: ''
      }]
    ]);
  });

  it('emits answers for every question in a multi-question payload', async () => {
    const wrapper = mountQuestionCard(
      createQuestion({
        questions: [
          {
            question: '请选择渠道',
            mode: 'single',
            options: [
              { label: '官网', value: 'official' },
              { label: '短视频', value: 'video' }
            ]
          },
          {
            question: '请选择发布节奏',
            mode: 'multiple',
            options: [
              { label: '每日', value: 'daily' },
              { label: '每周', value: 'weekly' }
            ]
          }
        ]
      })
    );

    await wrapper.find('input[value="official"]').setValue(true);
    await wrapper.find('input[value="daily"]').setValue(true);
    await wrapper.findAll('button')[0].trigger('click');
    await wrapper.findAll('button').at(-1)?.trigger('click');

    expect(wrapper.emitted('submit-choice')).toEqual([
      [{
        questionId: 'question-1',
        toolCallId: 'tool-call-1',
        answers: ['official'],
        questionAnswers: [
          {
            question: '请选择渠道',
            answers: ['official']
          },
          {
            question: '请选择发布节奏',
            answers: ['daily']
          }
        ],
        otherText: ''
      }]
    ]);
  });

  it('limits multiple selected answers by maxSelections', async () => {
    const wrapper = mountQuestionCard(createQuestion({ mode: 'multiple', maxSelections: 1 }));
    const checkboxes = wrapper.findAll('input[type="checkbox"]');

    await checkboxes[0].setValue(true);
    await nextTick();
    const updatedCheckboxes = wrapper.findAll('input[type="checkbox"]');

    expect((updatedCheckboxes[1].element as HTMLInputElement).disabled).toBe(true);
  });

  it('always supports submitting other text', async () => {
    const wrapper = mountQuestionCard(createQuestion());

    await wrapper.find('input[type="text"]').setValue('线下活动');
    await wrapper.findAll('button').at(-1)?.trigger('click');

    expect(wrapper.emitted('submit-choice')).toEqual([
      [{
        questionId: 'question-1',
        toolCallId: 'tool-call-1',
        answers: [],
        questionAnswers: [
          {
            question: '请选择渠道',
            answers: []
          }
        ],
        otherText: '线下活动'
      }]
    ]);
  });
});
