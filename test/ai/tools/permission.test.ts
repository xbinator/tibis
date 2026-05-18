/**
 * @file permission.test.ts
 * @description AI 工具权限策略执行器测试。
 */
import type { AIToolDefinition } from 'types/ai';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeWithPermission } from '@/ai/tools/permission';
import { useSettingStore } from '@/stores/ui/setting';

const storage = new Map<string, string>();

vi.stubGlobal('localStorage', {
  getItem(key: string): string | null {
    return storage.get(key) ?? null;
  },
  setItem(key: string, value: string): void {
    storage.set(key, value);
  },
  removeItem(key: string): void {
    storage.delete(key);
  },
  clear(): void {
    storage.clear();
  }
});

/**
 * 创建测试工具定义。
 * @param overrides - 覆盖项
 * @returns 工具定义
 */
function createToolDefinition(overrides: Partial<AIToolDefinition> = {}): AIToolDefinition {
  return {
    name: 'test_tool',
    description: 'Test tool',
    source: 'builtin',
    riskLevel: 'write',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false
    },
    ...overrides
  };
}

describe('executeWithPermission', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('falls back to confirmation for non-safe write tools in autoSafe mode', async () => {
    const confirm = vi.fn(async () => ({ approved: true }));
    const settingStore = useSettingStore();

    settingStore.setToolPermissionMode('autoSafe');
    const result = await executeWithPermission({
      definition: createToolDefinition({ safeAutoApprove: false }),
      adapter: { confirm },
      request: {
        toolName: 'test_tool',
        title: 'Confirm',
        description: 'Confirm write',
        riskLevel: 'write'
      },
      operation: () => ({ applied: true })
    });

    expect(result.status).toBe('success');
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it('removes remember options for dangerous tools even when requested', async () => {
    const confirm = vi.fn(async () => ({ approved: false }));

    await executeWithPermission({
      definition: createToolDefinition({ riskLevel: 'dangerous', safeAutoApprove: true }),
      adapter: { confirm },
      request: {
        toolName: 'test_tool',
        title: 'Confirm',
        description: 'Confirm dangerous write',
        riskLevel: 'dangerous',
        allowRemember: true,
        rememberScopes: ['session', 'always']
      },
      operation: () => ({ applied: true })
    });

    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        allowRemember: false,
        rememberScopes: undefined
      })
    );
  });

  it('does not store a grant when the operation fails', async () => {
    const confirm = vi.fn(async () => ({ approved: true, grantScope: 'always' as const }));
    const settingStore = useSettingStore();

    const result = await executeWithPermission({
      definition: createToolDefinition({ safeAutoApprove: true }),
      adapter: { confirm },
      request: {
        toolName: 'test_tool',
        title: 'Confirm',
        description: 'Confirm write',
        riskLevel: 'write',
        allowRemember: true,
        rememberScopes: ['always']
      },
      operation: () => {
        throw new Error('boom');
      }
    });

    expect(result.status).toBe('failure');
    expect(result.error?.code).toBe('EXECUTION_FAILED');
    expect(settingStore.alwaysToolPermissionGrants.test_tool).toBeUndefined();
  });
});
