/**
 * @file builtin-index.test.ts
 * @description 验证内置工具工厂的默认工具暴露。
 */
import { describe, expect, it } from 'vitest';
import { APPLY_DRAWING_OPERATIONS_TOOL_NAME, createBuiltinTools, READ_CURRENT_DRAWING_TOOL_NAME, UPDATE_CURRENT_DRAWING_TOOL_NAME } from '@/ai/tools/builtin';

describe('builtin tools index', (): void => {
  it('includes Drawing read and write tools in the builtin tool factory', (): void => {
    const toolNames = createBuiltinTools().map((tool) => tool.definition.name);

    expect(toolNames).toContain(READ_CURRENT_DRAWING_TOOL_NAME);
    expect(toolNames).toContain(UPDATE_CURRENT_DRAWING_TOOL_NAME);
    expect(toolNames).toContain(APPLY_DRAWING_OPERATIONS_TOOL_NAME);
  });
});
