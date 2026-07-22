/**
 * @file commandPanel.ts
 * @description 全局命令面板 Store，统一管理面板打开状态、输入内容与运行时关闭回调。
 */
import { defineStore } from 'pinia';
import type { CommandPanelModelContext, CommandPanelScope, OpenCommandPanelOptions, OpenModelCommandPanelOptions } from '@/components/BCommandPanel/types';
import type { SelectedModel } from '@/stores/ai/serviceModel';

/**
 * 命令面板 Store 状态。
 */
interface CommandPanelState {
  /** 面板是否可见。 */
  visible: boolean;
  /** 当前面板业务范围。 */
  scope: CommandPanelScope;
  /** 当前搜索输入内容。 */
  keyword: string;
}

/** 命令面板关闭后需要执行的一次性运行时回调。 */
let closeCallback: (() => void) | undefined;
/** 命令面板本次打开使用的模型上下文，不进入 Pinia state。 */
let modelContext: CommandPanelModelContext | undefined;

/**
 * 更新关闭回调；回调保存在模块闭包中，避免把函数放入 Pinia state。
 * @param callback - 关闭后回调
 */
function setCloseCallback(callback?: () => void): void {
  closeCallback = callback;
}

/**
 * 消费并清空关闭回调，保证同一次打开只触发一次。
 */
function runCloseCallback(): void {
  const callback = closeCallback;
  closeCallback = undefined;
  callback?.();
}

/**
 * 更新本次模型 scope 的调用方上下文。
 * @param context - 调用方模型上下文
 */
function setModelContext(context?: CommandPanelModelContext): void {
  modelContext = context;
}

/**
 * 全局命令面板 Store。
 */
export const useCommandPanelStore = defineStore('commandPanel', {
  state: (): CommandPanelState => ({
    visible: false,
    scope: 'recent',
    keyword: ''
  }),
  actions: {
    /**
     * 打开指定 scope 的命令面板。
     * @param scope - 命令面板业务范围
     * @param options - 打开配置
     */
    open(scope: CommandPanelScope, options: OpenCommandPanelOptions = {}): void {
      this.scope = scope;
      this.keyword = '';
      this.visible = true;
      setCloseCallback(options.onClose);
      setModelContext(undefined);
    },

    /**
     * 打开最近记录命令面板。
     * @param options - 打开配置
     */
    openRecent(options: OpenCommandPanelOptions = {}): void {
      this.open('recent', options);
    },

    /**
     * 打开模型选择命令面板。
     * @param options - 打开配置
     */
    openModel(options: OpenModelCommandPanelOptions = {}): void {
      this.open('model', options);
      setModelContext(options.modelContext);
    },

    /**
     * 读取本次打开的调用方当前模型。
     * @returns 调用方当前模型；无上下文时返回 undefined
     */
    getContextModel(): SelectedModel | undefined {
      return modelContext?.getCurrentModel();
    },

    /**
     * 使用本次打开的调用方规则切换模型。
     * @param model - 新模型标识
     * @returns 是否由调用方上下文处理
     */
    async changeContextModel(model: SelectedModel): Promise<boolean> {
      if (!modelContext) return false;
      await modelContext.onModelChange(model);
      return true;
    },

    /**
     * 更新命令面板搜索输入。
     * @param value - 新输入内容
     */
    setKeyword(value: string): void {
      this.keyword = value;
    },

    /**
     * 关闭命令面板并触发一次性关闭回调。
     */
    close(): void {
      if (!this.visible) {
        return;
      }

      this.visible = false;
      this.keyword = '';
      runCloseCallback();
      setModelContext(undefined);
    }
  }
});
