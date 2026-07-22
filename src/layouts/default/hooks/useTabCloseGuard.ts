/**
 * @file useTabCloseGuard.ts
 * @description 集中处理顶部标签关闭前的 Runtime 终止和未保存确认。
 */
import { message } from 'ant-design-vue';
import { isActiveRuntimeStatus, useChatTabStore } from '@/stores/chat/tab';
import type { TabClosePlan } from '@/stores/workspace/tabs';
import { asyncTo } from '@/utils/asyncTo';
import { Modal } from '@/utils/modal';

/**
 * 标签关闭守卫 API。
 */
interface TabCloseGuardApi {
  /** 检查并完成关闭前置确认。 */
  canClose: (plan: TabClosePlan) => Promise<boolean>;
  /** 清理已关闭聊天标签的 Runtime。 */
  cleanupClosedTabs: (tabIds: string[]) => void;
  /** 取消未完成的标签关闭事务。 */
  cancelClose: (tabIds: string[]) => void;
}

/**
 * 提供标签关闭前置确认能力。
 * @returns 标签关闭守卫 API
 */
export function useTabCloseGuard(): TabCloseGuardApi {
  const runtimeStore = useChatTabStore();

  /**
   * 确认并终止关闭计划中的活动聊天 Runtime。
   * @param plan - 标签关闭计划
   * @returns 是否允许继续关闭
   */
  async function confirmRuntimeClose(plan: TabClosePlan): Promise<boolean> {
    const activeTabIds = plan.targetTabIds.filter((tabId: string): boolean => isActiveRuntimeStatus(runtimeStore.getStatus(tabId)));
    if (activeTabIds.length === 0) return true;

    const isSingleTarget = plan.action === 'close' && activeTabIds.length === 1;
    const [confirmError, result] = await asyncTo(
      Modal.confirm(
        isSingleTarget ? '终止并关闭聊天' : '终止并批量关闭聊天',
        isSingleTarget
          ? '当前聊天仍在运行，关闭前需要先终止任务。确认继续吗？'
          : `即将关闭的标签中有 ${activeTabIds.length} 个聊天仍在运行或等待操作，确认全部终止并关闭吗？`
      )
    );
    if (confirmError || result[0]) return false;

    const [abortError] = await asyncTo(runtimeStore.abortTabs(activeTabIds));
    if (!abortError) return true;

    message.error(`终止聊天失败：${abortError.message}`);
    return false;
  }

  /**
   * 确认关闭计划中的未保存内容。
   * @param plan - 标签关闭计划
   * @returns 是否允许继续关闭
   */
  async function confirmDirtyClose(plan: TabClosePlan): Promise<boolean> {
    if (!plan.requiresConfirm) return true;

    const [confirmError, result] = await asyncTo(
      Modal.confirm(
        plan.action === 'close' ? '关闭标签' : '批量关闭标签',
        plan.action === 'close' ? '当前标签有未保存更改，确认关闭吗？' : `即将关闭 ${plan.targetTabIds.length} 个标签，其中包含未保存更改，确认继续吗？`
      )
    );

    return !confirmError && !result[0];
  }

  /**
   * 检查并完成关闭计划的全部前置条件。
   * @param plan - 标签关闭计划
   * @returns 是否允许应用关闭计划
   */
  async function canClose(plan: TabClosePlan): Promise<boolean> {
    if (plan.disabled) return false;
    const chatTabIds = plan.targetTabIds.filter((tabId: string): boolean => tabId.startsWith('chat:'));
    // 标签身份尚未提交完成时不允许并发关闭，否则导航取消会让关闭计划失去目标。
    if (chatTabIds.some((tabId: string): boolean => runtimeStore.isPromoting(tabId))) return false;
    // 同一标签只允许一个关闭事务，避免重复点击互相清除关闭意图。
    if (chatTabIds.some((tabId: string): boolean => runtimeStore.isClosing(tabId))) return false;
    runtimeStore.markClosing(chatTabIds);

    if (!(await confirmRuntimeClose(plan))) {
      runtimeStore.clearClosing(chatTabIds);
      return false;
    }

    const dirtyAllowed = await confirmDirtyClose(plan);
    if (!dirtyAllowed) runtimeStore.clearClosing(chatTabIds);
    return dirtyAllowed;
  }

  /**
   * 取消未能提交的关闭事务。
   * @param tabIds - 原关闭计划中的标签 ID
   */
  function cancelClose(tabIds: string[]): void {
    runtimeStore.clearClosing(tabIds.filter((tabId: string): boolean => tabId.startsWith('chat:')));
  }

  /**
   * 清理已关闭聊天标签的 Runtime 记录和控制器。
   * @param tabIds - 已关闭的标签 ID
   */
  function cleanupClosedTabs(tabIds: string[]): void {
    tabIds.filter((tabId: string): boolean => tabId.startsWith('chat:')).forEach((tabId: string): void => runtimeStore.removeTab(tabId));
  }

  return { canClose, cleanupClosedTabs, cancelClose };
}
