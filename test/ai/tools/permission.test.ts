/**
 * @file permission.test.ts
 * @description 验证工具权限包装器保留受控操作的明确错误码。
 * @vitest-environment jsdom
 */
import type { AIToolDefinition } from 'types/ai';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIToolConfirmationAdapter, AIToolConfirmationRequest } from '@/ai/tools/confirmation';
import { AIToolOperationError, executeWithPermission } from '@/ai/tools/permission';

const definition: AIToolDefinition = {
  name: 'edit_widget',
  description: 'Edit Widget',
  source: 'builtin',
  riskLevel: 'write',
  permissionCategory: 'document',
  requiresActiveDocument: false,
  parameters: {
    type: 'object',
    properties: {}
  }
};

const request: AIToolConfirmationRequest = {
  toolName: 'edit_widget',
  title: '编辑当前小组件',
  description: '应用结构化 Patch',
  riskLevel: 'write'
};

describe('executeWithPermission', (): void => {
  beforeEach((): void => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('preserves the error code from AIToolOperationError', async (): Promise<void> => {
    const adapter: AIToolConfirmationAdapter = {
      confirm: vi.fn(async (): Promise<true> => true),
      onExecutionStart: vi.fn(),
      onExecutionComplete: vi.fn()
    };
    const result = await executeWithPermission({
      definition,
      adapter,
      request,
      operation: async (): Promise<never> => {
        throw new AIToolOperationError('STALE_CONTEXT', 'Widget 页面已切换');
      }
    });

    expect(result).toMatchObject({
      toolName: 'edit_widget',
      status: 'failure',
      error: {
        code: 'STALE_CONTEXT',
        message: 'Widget 页面已切换'
      }
    });
    expect(adapter.onExecutionComplete).toHaveBeenCalledWith(expect.objectContaining(request), {
      status: 'failure',
      errorMessage: 'Widget 页面已切换'
    });
  });
});
