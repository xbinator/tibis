/**
 * @file commandPanel.ts
 * @description 全局命令面板 Store，统一管理面板打开状态、输入内容与运行时关闭回调。
 */
import { defineStore } from 'pinia';
import type { CommandPanelScope, OpenCommandPanelOptions } from '@/components/BCommandPanel/types';

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
    openModel(options: OpenCommandPanelOptions = {}): void {
      this.open('model', options);
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
    }
  }
});
