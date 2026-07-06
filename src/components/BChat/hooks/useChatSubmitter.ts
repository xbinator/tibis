/**
 * @file useChatSubmitter.ts
 * @description BChat 消息级交互统一提交 hook。
 */
import type { BChatRuntimeSubmitUserChoiceInput } from './useChatRuntime';
import type { ChatTaskKind, ChatTaskStartResult, ChatTaskState } from './useChatTaskRuntime';
import type { AdaptedUserMessageInput, SubmitAction } from '../utils/submitAction';
import type { AIUserChoiceAnswerData } from 'types/chat';
import type { ChatRuntimeSendInput, ChatRuntimeStartResult } from 'types/chat-runtime';
import type { Ref } from 'vue';

/** ChatRuntime 通用请求配置。 */
type ChatRuntimeRequestConfig = Pick<ChatRuntimeSendInput, 'contextWindow' | 'system' | 'workspaceRoot' | 'tools' | 'tavily' | 'mcp'>;

/**
 * 统一提交器依赖的任务运行时能力。
 */
interface ChatSubmitterTaskRuntime {
  /** 当前活跃任务。 */
  activeTask: Ref<ChatTaskState>;
  /**
   * 启动任务。
   * @param kind - 任务类型
   * @returns 启动结果
   */
  beginTask: (kind: ChatTaskKind) => ChatTaskStartResult;
  /**
   * 结束任务。
   * @param kind - 任务类型
   */
  finishTask: (kind: ChatTaskKind) => void;
}

/**
 * BChat 统一提交 hook 选项。
 */
interface UseChatSubmitterOptions {
  /** 任务运行时。 */
  taskRuntime: ChatSubmitterTaskRuntime;
  /** 获取当前会话 ID。 */
  getSessionId: () => string | undefined;
  /** 解析 Runtime 请求配置。 */
  resolveRuntimeRequestConfig: () => Promise<ChatRuntimeRequestConfig | null>;
  /** 提交用户选择并续跑。 */
  submitUserChoice: (input: BChatRuntimeSubmitUserChoiceInput) => Promise<ChatRuntimeStartResult>;
  /** 发送已创建的用户消息。 */
  sendRuntimeUserMessage: (input: AdaptedUserMessageInput) => Promise<void>;
}

/**
 * BChat 统一提交 hook 返回值。
 */
interface UseChatSubmitterReturn {
  /**
   * 提交消息级交互动作。
   * @param action - 已由底层组件适配好的提交动作
   */
  submit: (action: SubmitAction) => Promise<void>;
}

/**
 * 创建 BChat 消息级交互统一提交器。
 * @param options - 提交器依赖
 * @returns 统一提交能力
 */
export function useChatSubmitter(options: UseChatSubmitterOptions): UseChatSubmitterReturn {
  /**
   * 续跑一个等待中的助手任务。
   * @param answer - 用户选择答案
   */
  async function continueAssistantTurn(answer: AIUserChoiceAnswerData): Promise<void> {
    const isActiveChatTask = options.taskRuntime.activeTask.value === 'chat';
    if (!isActiveChatTask) {
      const startResult = options.taskRuntime.beginTask('chat');
      if (!startResult.ok) {
        return;
      }
    }

    try {
      const sessionId = options.getSessionId();
      if (!sessionId) {
        options.taskRuntime.finishTask('chat');
        return;
      }

      const runtimeConfig = await options.resolveRuntimeRequestConfig();
      if (!runtimeConfig) {
        options.taskRuntime.finishTask('chat');
        return;
      }

      const result = await options.submitUserChoice({
        sessionId,
        answer,
        ...runtimeConfig
      });
      if (result.completed === true) {
        options.taskRuntime.finishTask('chat');
      }
    } catch (error) {
      options.taskRuntime.finishTask('chat');
      throw error;
    }
  }

  /**
   * 提交 renderer 已构造好的用户消息。
   * @param input - 运行态用户消息提交输入
   */
  async function sendAdaptedUserMessage(input: AdaptedUserMessageInput): Promise<void> {
    const isActiveChatTask = options.taskRuntime.activeTask.value === 'chat';
    if (!isActiveChatTask) {
      const startResult = options.taskRuntime.beginTask('chat');
      if (!startResult.ok) return;
    }

    await options.sendRuntimeUserMessage(input);
  }

  /**
   * 提交消息级交互动作。
   * @param action - 已由底层组件适配好的提交动作
   */
  async function submit(action: SubmitAction): Promise<void> {
    await action.run({
      continueAssistantTurn,
      sendAdaptedUserMessage
    });
  }

  return { submit };
}
