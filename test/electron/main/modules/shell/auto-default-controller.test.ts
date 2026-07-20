/**
 * @file auto-default-controller.test.ts
 * @description AutoDefaultController checkpoint、转换屏障和停止条件测试。
 */
import type { PromptDecision } from '../../../../../electron/main/modules/shell/interaction/prompt-detector.mts';
import { describe, expect, it } from 'vitest';
import { createAutoDefaultController, type AutoDefaultObservation } from '../../../../../electron/main/modules/shell/interaction/auto-default-controller.mts';

/**
 * 创建控制器观察值。
 * @param screenHash - 稳定屏幕哈希
 * @param decision - detector 决策
 * @param now - 单调时间
 * @returns 控制器观察值
 */
function observe(screenHash: string | undefined, decision: PromptDecision, now: number): AutoDefaultObservation {
  return { screenHash, decision, now, lastOutputAt: Number.NEGATIVE_INFINITY };
}

/** 高置信度布尔默认决策。 */
const AUTO_DEFAULT: PromptDecision = { type: 'auto_default', promptKind: 'boolean_default', confidence: 0.98 };

describe('AutoDefaultController', (): void => {
  it('settles a prompt and answers one checkpoint only once', (): void => {
    const controller = createAutoDefaultController();

    expect(controller.observe(observe('same', AUTO_DEFAULT, 0))).toBeNull();
    expect(controller.observe(observe('same', AUTO_DEFAULT, 399))).toBeNull();
    expect(controller.observe(observe('same', AUTO_DEFAULT, 400))).toEqual({ type: 'submit_enter' });
    expect(controller.observe(observe('same', AUTO_DEFAULT, 1_000))).toBeNull();
    expect(controller.answerCount()).toBe(1);
  });

  it('requires a PTY byte-silence window before settling a prompt', (): void => {
    const controller = createAutoDefaultController();

    expect(controller.observe({ ...observe('same', AUTO_DEFAULT, 0), lastOutputAt: 0 })).toBeNull();
    expect(controller.observe({ ...observe('same', AUTO_DEFAULT, 999), lastOutputAt: 0 })).toBeNull();
    expect(controller.observe({ ...observe('same', AUTO_DEFAULT, 1_000), lastOutputAt: 0 })).toBeNull();
    expect(controller.observe({ ...observe('same', AUTO_DEFAULT, 1_399), lastOutputAt: 0 })).toBeNull();
    expect(controller.observe({ ...observe('same', AUTO_DEFAULT, 1_400), lastOutputAt: 0 })).toEqual({ type: 'submit_enter' });
  });

  it('allows the same hash again only after a settled transition barrier', (): void => {
    const controller = createAutoDefaultController();
    controller.observe(observe('same', AUTO_DEFAULT, 0));
    controller.observe(observe('same', AUTO_DEFAULT, 400));

    controller.observe(observe(undefined, { type: 'active_output' }, 500));
    controller.observe(observe(undefined, { type: 'active_output' }, 750));
    expect(controller.observe(observe('same', AUTO_DEFAULT, 800))).toBeNull();
    expect(controller.observe(observe('same', AUTO_DEFAULT, 1_200))).toEqual({ type: 'submit_enter' });

    expect(controller.history().entries.map((entry) => entry.checkpoint.screenHash)).toEqual(['same', 'same']);
    expect(controller.history().entries[0]?.closed).toBe(true);
  });

  it('does not reopen an answered checkpoint after an unknown no-region gap', (): void => {
    const controller = createAutoDefaultController();
    controller.observe(observe('same', AUTO_DEFAULT, 0));
    expect(controller.observe(observe('same', AUTO_DEFAULT, 400))).toEqual({ type: 'submit_enter' });

    controller.observe(observe(undefined, { type: 'unknown' }, 500));
    controller.observe(observe(undefined, { type: 'unknown' }, 750));
    controller.observe(observe('same', AUTO_DEFAULT, 800));

    expect(controller.observe(observe('same', AUTO_DEFAULT, 1_200))).toBeNull();
    expect(controller.answerCount()).toBe(1);
    expect(controller.history().entries).toHaveLength(1);
  });

  it('does not treat a single PTY echo as a completed transition', (): void => {
    const controller = createAutoDefaultController();
    controller.observe(observe('same', AUTO_DEFAULT, 0));
    expect(controller.observe(observe('same', AUTO_DEFAULT, 400))).toEqual({ type: 'submit_enter' });

    controller.observe({ ...observe('same', AUTO_DEFAULT, 500), lastOutputAt: 500 });
    controller.observe({ ...observe('same', AUTO_DEFAULT, 750), lastOutputAt: 500 });
    controller.observe(observe('same', AUTO_DEFAULT, 1_500));
    controller.observe(observe('same', AUTO_DEFAULT, 1_900));

    expect(controller.answerCount()).toBe(1);
    expect(controller.history().entries).toHaveLength(1);
  });

  it('applies confidence and answer limits outside the detector', (): void => {
    const controller = createAutoDefaultController({ maxAnswers: 1 });
    const low: PromptDecision = { type: 'auto_default', promptKind: 'wizard_default', confidence: 0.84 };

    controller.observe(observe('low', low, 0));
    expect(controller.observe(observe('low', low, 400))).toBeNull();
    controller.observe(observe('first', AUTO_DEFAULT, 500));
    expect(controller.observe(observe('first', AUTO_DEFAULT, 900))).toEqual({ type: 'submit_enter' });
    controller.observe(observe(undefined, { type: 'active_output' }, 1_000));
    controller.observe(observe(undefined, { type: 'active_output' }, 1_250));
    controller.observe(observe('second', AUTO_DEFAULT, 1_300));
    expect(controller.observe(observe('second', AUTO_DEFAULT, 1_700))).toEqual({ type: 'request_stop', reason: 'answer_limit' });
  });

  it('distinguishes unsupported prompts and unresolved interaction timeout from active output', (): void => {
    const controller = createAutoDefaultController();

    expect(controller.observe(observe('secret', { type: 'unsupported_input', reason: 'secret' }, 0))).toEqual({
      type: 'request_stop',
      reason: 'unsupported_prompt'
    });

    const unknown = createAutoDefaultController();
    expect(unknown.observe(observe('unknown', { type: 'unknown' }, 0))).toBeNull();
    expect(unknown.observe(observe('unknown', { type: 'active_output' }, 7_900))).toBeNull();
    expect(unknown.observe(observe('unknown', { type: 'unknown' }, 8_000))).toBeNull();
    expect(unknown.observe(observe('unknown', { type: 'unknown' }, 16_000))).toEqual({ type: 'request_stop', reason: 'interaction_timeout' });
  });

  it('freezes state after dispose', (): void => {
    const controller = createAutoDefaultController();
    controller.dispose();

    expect(controller.observe(observe('same', AUTO_DEFAULT, 1_000))).toBeNull();
    expect(controller.history().entries).toEqual([]);
  });
});
