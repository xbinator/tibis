/**
 * @file builtin-index.test.ts
 * @description 验证内置工具工厂的默认工具暴露。
 */
import { describe, expect, it } from 'vitest';
import {
  CONDITIONAL_BUILTIN_READONLY_TOOL_NAMES,
  CONDITIONAL_BUILTIN_WRITABLE_TOOL_NAMES,
  createBuiltinTools,
  DEFAULT_BUILTIN_READONLY_TOOL_NAMES,
  DEFAULT_BUILTIN_WRITABLE_TOOL_NAMES,
  OPERATE_WEBPAGE_TOOL_NAME,
  READ_CURRENT_WEBPAGE_TOOL_NAME,
} from '@/ai/tools/builtin';
import { getToolNamesByExposure } from '../../../shared/ai/tools/toolRegistry.js';

describe('builtin tools index', (): void => {
  it('does not expose Drawing tools by default', (): void => {
    const toolNames = createBuiltinTools().map((tool) => tool.definition.name);

    expect(toolNames).not.toContain('read_current_drawing');
    expect(toolNames).not.toContain('create_drawing');
    expect(toolNames).not.toContain('apply_drawing_operations');
    expect(toolNames).not.toContain('update_current_drawing');
  });

  it('derives migrated tool exposure lists from the shared tool registry', (): void => {
    expect(DEFAULT_BUILTIN_READONLY_TOOL_NAMES).toEqual(expect.arrayContaining(getToolNamesByExposure('default-readonly')));
    expect(DEFAULT_BUILTIN_WRITABLE_TOOL_NAMES).toEqual(expect.arrayContaining(getToolNamesByExposure('default-writable')));
    expect(CONDITIONAL_BUILTIN_READONLY_TOOL_NAMES).toEqual(expect.arrayContaining(getToolNamesByExposure('conditional-readonly')));
    expect(CONDITIONAL_BUILTIN_WRITABLE_TOOL_NAMES).toEqual(getToolNamesByExposure('conditional-writable'));
  });

  it('keeps WebView schema-only tools available for runtime filtering', (): void => {
    const toolNames = createBuiltinTools().map((tool) => tool.definition.name);

    expect(toolNames).toEqual(expect.arrayContaining([READ_CURRENT_WEBPAGE_TOOL_NAME, OPERATE_WEBPAGE_TOOL_NAME]));
  });
});
