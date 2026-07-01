/**
 * @file submitAction.ts
 * @description BChat 消息级交互统一提交动作类型。
 */
import type { Message } from './types';
import type { AIUserChoiceAnswerData } from 'types/chat';
import type { ChatRuntimeUserInputPart } from 'types/chat-runtime';

/**
 * BChat 可见消息更新函数。
 */
export type BChatMessageUpdater = (message: Message) => Message;

/**
 * 已由底层组件适配好的用户消息提交输入。
 */
export interface BChatAdaptedUserMessageSubmitInput {
  /** Renderer 侧已创建的用户消息 */
  userMessage: Message;
  /** 发送给 ChatRuntime 的结构化输入片段 */
  parts: ChatRuntimeUserInputPart[];
  /** 发送失败时展示或写入的错误提示 */
  errorMessage: string;
  /** 是否清空主输入框草稿 */
  clearDraft?: boolean;
}

/**
 * BChat 消息级交互统一提交上下文。
 */
export interface BChatSubmitContext {
  /**
   * 续跑等待中的助手任务。
   * @param answer - 用户选择答案
   */
  continueAssistantTurn: (answer: AIUserChoiceAnswerData) => Promise<void>;
  /**
   * 发送底层组件已适配好的用户消息。
   * @param input - 用户消息提交输入
   */
  sendAdaptedUserMessage: (input: BChatAdaptedUserMessageSubmitInput) => Promise<void>;
  /**
   * 更新一条已经存在的可见消息。
   * @param messageId - 待更新消息 ID
   * @param updater - 基于当前消息生成下一版消息的函数
   */
  updateMessage: (messageId: string, updater: BChatMessageUpdater) => Promise<void>;
}

/**
 * BChat 消息级交互统一提交动作。
 */
export interface BChatSubmitAction {
  /**
   * 运行已经由底层组件适配好的提交动作。
   * @param context - 统一提交上下文
   */
  run: (context: BChatSubmitContext) => Promise<void>;
}

/**
 * 创建用户选择提交动作。
 * @param answer - 用户选择答案
 * @returns 统一提交动作
 */
export function createUserChoiceSubmitAction(answer: AIUserChoiceAnswerData): BChatSubmitAction {
  return {
    async run(context: BChatSubmitContext): Promise<void> {
      await context.continueAssistantTurn(answer);
    }
  };
}

/**
 * 创建运行态用户消息提交动作。
 * @param input - 用户消息提交输入
 * @returns 统一提交动作
 */
export function createRuntimeUserMessageSubmitAction(input: BChatAdaptedUserMessageSubmitInput): BChatSubmitAction {
  return {
    async run(context: BChatSubmitContext): Promise<void> {
      await context.sendAdaptedUserMessage(input);
    }
  };
}

/**
 * 创建消息更新提交动作。
 * @param messageId - 待更新消息 ID
 * @param updater - 基于当前消息生成下一版消息的函数
 * @returns 统一提交动作
 */
export function createMessageUpdateSubmitAction(messageId: string, updater: BChatMessageUpdater): BChatSubmitAction {
  return {
    async run(context: BChatSubmitContext): Promise<void> {
      await context.updateMessage(messageId, updater);
    }
  };
}
