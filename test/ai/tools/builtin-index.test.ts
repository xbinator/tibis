/**
 * @file builtin-index.test.ts
 * @description 验证内置工具工厂的默认工具暴露。
 */
import { describe, expect, it } from 'vitest';
import {
  APPLY_DRAWING_OPERATIONS_TOOL_NAME,
  CONDITIONAL_BUILTIN_READONLY_TOOL_NAMES,
  CONDITIONAL_BUILTIN_WRITABLE_TOOL_NAMES,
  CREATE_DRAWING_TOOL_NAME,
  createBuiltinTools,
  DEFAULT_BUILTIN_READONLY_TOOL_NAMES,
  DEFAULT_BUILTIN_WRITABLE_TOOL_NAMES,
  READ_CURRENT_DRAWING_TOOL_NAME,
  UPDATE_CURRENT_DRAWING_TOOL_NAME
} from '@/ai/tools/builtin';
import { getToolNamesByExposure } from '../../../shared/ai/tools/toolRegistry.js';

describe('builtin tools index', (): void => {
  it('exposes the Drawing operation tool but not the full replacement tool by default', (): void => {
    const toolNames = createBuiltinTools().map((tool) => tool.definition.name);

    expect(toolNames).toContain(READ_CURRENT_DRAWING_TOOL_NAME);
    expect(toolNames).toContain(CREATE_DRAWING_TOOL_NAME);
    expect(toolNames).toContain(APPLY_DRAWING_OPERATIONS_TOOL_NAME);
    expect(toolNames).not.toContain(UPDATE_CURRENT_DRAWING_TOOL_NAME);
  });

  it('derives migrated tool exposure lists from the shared tool registry', (): void => {
    expect(DEFAULT_BUILTIN_READONLY_TOOL_NAMES).toEqual(expect.arrayContaining(getToolNamesByExposure('default-readonly')));
    expect(DEFAULT_BUILTIN_WRITABLE_TOOL_NAMES).toEqual(expect.arrayContaining(getToolNamesByExposure('default-writable')));
    expect(CONDITIONAL_BUILTIN_READONLY_TOOL_NAMES).toEqual(expect.arrayContaining(getToolNamesByExposure('conditional-readonly')));
    expect(CONDITIONAL_BUILTIN_WRITABLE_TOOL_NAMES).toEqual(getToolNamesByExposure('conditional-writable'));
  });
});
