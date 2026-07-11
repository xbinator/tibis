/**
 * @file runtime-capabilities.test.ts
 * @description Runtime renderer capability registry 测试。
 */
import type { AIToolExecutor } from 'types/ai';
import { describe, expect, it, vi } from 'vitest';
import { createRuntimeCapabilityRegistry } from '@/ai/chat/runtimeCapabilities';

/**
 * 创建测试工具。
 * @param name - 工具名称
 * @returns 工具执行器
 */
function createTool(name: string): AIToolExecutor {
  return {
    definition: {
      name,
      description: name,
      source: 'builtin',
      riskLevel: 'read',
      parameters: { type: 'object', properties: {} }
    },
    execute: async () => ({ toolName: name, status: 'success', data: null })
  };
}

describe('runtime capability registry', (): void => {
  it('freezes capabilities by runtime and releases them explicitly', (): void => {
    const registry = createRuntimeCapabilityRegistry();
    const sourceTools = [createTool('read_file')];
    const handleBridgeRequest = vi.fn(async (): Promise<unknown> => ({ ok: true }));
    registry.register('runtime-1', {
      tools: sourceTools,
      documentId: 'document-1',
      getToolContext: () => undefined,
      handleBridgeRequest
    });
    sourceTools.push(createTool('edit_file'));

    expect(registry.get('runtime-1')?.tools.map((tool) => tool.definition.name)).toEqual(['read_file']);
    expect(registry.get('runtime-1')?.documentId).toBe('document-1');
    expect(registry.delete('runtime-1')).toBe(true);
    expect(registry.get('runtime-1')).toBeUndefined();
  });
});
