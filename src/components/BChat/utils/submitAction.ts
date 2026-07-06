/**
 * @file submitAction.ts
 * @description BChat 消息级交互统一提交动作类型。
 */
import type { Message } from './types';
import type { AIUserChoiceAnswerData } from 'types/chat';
import type { ChatRuntimeUserInputPart } from 'types/chat-runtime';

/**
 * 已由底层组件适配好的用户消息提交输入。
 */
export interface AdaptedUserMessageInput {
  /** Renderer 侧已创建的用户消息 */
  userMessage: Message;
  /** 发送给 ChatRuntime 的结构化输入片段 */
  parts: ChatRuntimeUserInputPart[];
  /** 是否清空主输入框草稿 */
  clearDraft?: boolean;
}

/**
 * BChat 消息级交互统一提交上下文。
 */
export interface SubmitContext {
  /**
   * 续跑等待中的助手任务。
   * @param answer - 用户选择答案
   */
  continueAssistantTurn: (answer: AIUserChoiceAnswerData) => Promise<void>;
  /**
   * 发送底层组件已适配好的用户消息。
   * @param input - 用户消息提交输入
   */
  sendAdaptedUserMessage: (input: AdaptedUserMessageInput) => Promise<void>;
}

/**
 * BChat 消息级交互统一提交动作。
 */
export interface SubmitAction {
  /**
   * 运行已经由底层组件适配好的提交动作。
   * @param context - 统一提交上下文
   */
  run: (context: SubmitContext) => Promise<void>;
}

/**
 * 创建用户选择提交动作。
 * @param answer - 用户选择答案
 * @returns 统一提交动作
 */
export function createUserChoice(answer: AIUserChoiceAnswerData): SubmitAction {
  return {
    async run(context: SubmitContext): Promise<void> {
      await context.continueAssistantTurn(answer);
    }
  };
}
