/**
 * @file confirmation-controller.test.ts
 * @description BChat 确认控制器测试。
 */
import { describe, expect, it } from 'vitest';
import type { AIToolConfirmationRequest } from '@/ai/tools/confirmation';
import { createChatConfirmationController } from '@/components/BChat/utils/confirmationController';

/**
 * 创建测试确认请求。
 * @param toolName - 工具名称
 * @returns 确认请求
 */
function createRequest(toolName: string): AIToolConfirmationRequest {
  return {
    toolCallId: `tool-call-${toolName}`,
    toolName,
    title: `确认 ${toolName}`,
    description: `是否执行 ${toolName}`,
    riskLevel: 'read'
  };
}

describe('createChatConfirmationController', (): void => {
  it('queues new confirmations without cancelling the active one', async (): Promise<void> => {
    const controller = createChatConfirmationController();
    const firstPromise = controller.requestConfirmation(createRequest('read_file'));
    const firstConfirmationId = controller.currentConfirmationId.value;
    let firstSettled = false;
    firstPromise.then(() => {
      firstSettled = true;
    });

    const secondPromise = controller.requestConfirmation(createRequest('run_shell_command'));
    const secondSettled = false;
    await Promise.resolve();

    expect(firstSettled).toBe(false);
    expect(controller.currentConfirmationRequest.value?.toolName).toBe('read_file');
    expect(controller.currentConfirmationId.value).toBe(firstConfirmationId);

    controller.approveConfirmation(firstConfirmationId ?? '');
    await expect(firstPromise).resolves.toEqual({ approved: true });

    expect(controller.currentConfirmationRequest.value?.toolName).toBe('run_shell_command');
    expect(controller.currentConfirmationId.value).not.toBe(firstConfirmationId);

    controller.cancelConfirmation(controller.currentConfirmationId.value ?? '');
    await expect(secondPromise).resolves.toEqual({ approved: false });
    expect(secondSettled).toBe(false);
  });
});
