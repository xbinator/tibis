import { describe, expect, it, vi } from 'vitest';
import type { SkillDefinition } from '@/ai/skill/types';
import {
  ADD_MCP_SERVER_TOOL_NAME,
  createBuiltinTools,
  GET_MCP_SETTINGS_TOOL_NAME,
  GET_SETTINGS_TOOL_NAME,
  QUESTION_TOOL_NAME,
  QUERY_LOGS_TOOL_NAME,
  READ_DIRECTORY_TOOL_NAME,
  REFRESH_MCP_DISCOVERY_TOOL_NAME,
  REMOVE_MCP_SERVER_TOOL_NAME,
  SKILL_TOOL_NAME,
  UPDATE_MCP_SERVER_TOOL_NAME,
  UPDATE_SETTINGS_TOOL_NAME
} from '@/ai/tools/builtin';

/**
 * 提取工具名称列表。
 * @param includeWriteTools - 是否包含写工具
 * @returns 工具名称列表
 */
function getToolNames(includeWriteTools = false): string[] {
  return createBuiltinTools(
    includeWriteTools
      ? {
          confirm: {
            confirm: async () => true
          }
        }
      : undefined
  ).map((tool) => tool.definition.name);
}

describe('createBuiltinTools', () => {
  it('returns read tools by default', () => {
    expect(getToolNames()).toEqual([
      'read_current_document',
      'get_current_time',
      'question',
      'read_file',
      'read_directory',
      'get_settings',
      'get_mcp_settings',
      'query_logs'
    ]);
  });

  it('includes write tools when confirmation adapter is provided', () => {
    const names = getToolNames(true);
    expect(names).toContain('edit_file');
    expect(names).toContain('write_file');
    expect(names).toContain('update_settings');
    expect(names).toContain('add_mcp_server');
    expect(names).toContain('update_mcp_server');
    expect(names).toContain('remove_mcp_server');
    expect(names).toContain('refresh_mcp_discovery');
  });
});

describe('builtin tool exports', () => {
  it('exports read tool names', () => {
    expect(READ_DIRECTORY_TOOL_NAME).toBe('read_directory');
    expect(QUESTION_TOOL_NAME).toBe('question');
    expect(QUERY_LOGS_TOOL_NAME).toBe('query_logs');
    expect(GET_SETTINGS_TOOL_NAME).toBe('get_settings');
    expect(GET_MCP_SETTINGS_TOOL_NAME).toBe('get_mcp_settings');
  });

  it('exports write tool names', () => {
    expect(UPDATE_SETTINGS_TOOL_NAME).toBe('update_settings');
    expect(ADD_MCP_SERVER_TOOL_NAME).toBe('add_mcp_server');
    expect(UPDATE_MCP_SERVER_TOOL_NAME).toBe('update_mcp_server');
    expect(REMOVE_MCP_SERVER_TOOL_NAME).toBe('remove_mcp_server');
    expect(REFRESH_MCP_DISCOVERY_TOOL_NAME).toBe('refresh_mcp_discovery');
  });

  it('exports skill tool name', () => {
    expect(SKILL_TOOL_NAME).toBe('skill');
  });
});

describe('createBuiltinTools with skill tool', () => {
  /** 创建 mock skill store */
  function createMockSkillStore(initialized: boolean, skills: SkillDefinition[] = []) {
    return {
      getEnabledSkills: vi.fn(() => skills),
      getSkillByName: vi.fn((name: string) => skills.find((s) => s.name === name)),
      initialized
    };
  }

  it('includes skill tool when skillStore is provided and initialized', () => {
    const mockSkillStore = createMockSkillStore(true);
    const tools = createBuiltinTools({
      confirm: { confirm: async () => true },
      skillStore: mockSkillStore
    });

    const skillTool = tools.find((t) => t.definition.name === 'skill');
    expect(skillTool).toBeDefined();
  });

  it('excludes skill tool when skillStore is not provided', () => {
    const tools = createBuiltinTools({
      confirm: { confirm: async () => true }
    });

    const skillTool = tools.find((t) => t.definition.name === 'skill');
    expect(skillTool).toBeUndefined();
  });

  it('excludes skill tool when skillStore is not initialized', () => {
    const mockSkillStore = createMockSkillStore(false);
    const tools = createBuiltinTools({
      confirm: { confirm: async () => true },
      skillStore: mockSkillStore
    });

    const skillTool = tools.find((t) => t.definition.name === 'skill');
    expect(skillTool).toBeUndefined();
  });
});
