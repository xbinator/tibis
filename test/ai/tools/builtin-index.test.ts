import { describe, expect, it, vi } from 'vitest';
import type { SkillDefinition } from '@/ai/skill/types';
import {
  ADD_MCP_SERVER_TOOL_NAME,
  CREATE_DOCUMENT_TOOL_NAME,
  createBuiltinTools,
  GET_MCP_SETTINGS_TOOL_NAME,
  GET_SETTINGS_TOOL_NAME,
  isSdkManagedToolName,
  QUESTION_TOOL_NAME,
  QUERY_LOGS_TOOL_NAME,
  READ_CURRENT_WEBPAGE_TOOL_NAME,
  READ_DIRECTORY_TOOL_NAME,
  REFRESH_MCP_DISCOVERY_TOOL_NAME,
  REMOVE_MCP_SERVER_TOOL_NAME,
  RUN_SHELL_COMMAND_TOOL_NAME,
  SKILL_TOOL_NAME,
  TODO_WRITE_TOOL_NAME,
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
      'read_current_webpage',
      'read_file',
      'open_resource',
      'get_settings',
      'query_logs',
      'todowrite',
      'create_document',
      'edit_memory'
    ]);
  });

  it('includes write tools when confirmation adapter is provided', () => {
    const names = getToolNames(true);
    expect(names).toContain('create_document');
    expect(names).toContain('edit_file');
    expect(names).toContain('write_file');
    expect(names).toContain('update_settings');
    // run_shell_command is only registered when native.supportsShellCommand() returns true (Electron)
  });
});

describe('builtin tool exports', () => {
  it('exports read tool names', () => {
    expect(READ_CURRENT_WEBPAGE_TOOL_NAME).toBe('read_current_webpage');
    expect(READ_DIRECTORY_TOOL_NAME).toBe('read_directory');
    expect(QUESTION_TOOL_NAME).toBe('question');
    expect(QUERY_LOGS_TOOL_NAME).toBe('query_logs');
    expect(GET_SETTINGS_TOOL_NAME).toBe('get_settings');
    expect(GET_MCP_SETTINGS_TOOL_NAME).toBe('get_mcp_settings');
  });

  it('exports write tool names', () => {
    expect(CREATE_DOCUMENT_TOOL_NAME).toBe('create_document');
    expect(TODO_WRITE_TOOL_NAME).toBe('todowrite');
    expect(UPDATE_SETTINGS_TOOL_NAME).toBe('update_settings');
    expect(ADD_MCP_SERVER_TOOL_NAME).toBe('add_mcp_server');
    expect(UPDATE_MCP_SERVER_TOOL_NAME).toBe('update_mcp_server');
    expect(REMOVE_MCP_SERVER_TOOL_NAME).toBe('remove_mcp_server');
    expect(REFRESH_MCP_DISCOVERY_TOOL_NAME).toBe('refresh_mcp_discovery');
    expect(RUN_SHELL_COMMAND_TOOL_NAME).toBe('run_shell_command');
  });

  it('exports skill tool name', () => {
    expect(SKILL_TOOL_NAME).toBe('skill');
  });
});

describe('isSdkManagedToolName', () => {
  it('returns true for tavily_search', () => {
    expect(isSdkManagedToolName('tavily_search')).toBe(true);
  });

  it('returns true for tavily_extract', () => {
    expect(isSdkManagedToolName('tavily_extract')).toBe(true);
  });

  it('returns true for MCP tool names with mcp_ prefix', () => {
    expect(isSdkManagedToolName('mcp_6e706d_726561645f66696c65')).toBe(true);
  });

  it('returns false for builtin tool names', () => {
    expect(isSdkManagedToolName('read_file')).toBe(false);
    expect(isSdkManagedToolName('write_file')).toBe(false);
    expect(isSdkManagedToolName('question')).toBe(false);
  });

  it('returns false for unknown tool names', () => {
    expect(isSdkManagedToolName('some_random_tool')).toBe(false);
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

  it('includes skill tool when skillStore is provided, initialized and has enabled skills', () => {
    const mockSkillStore = createMockSkillStore(true, [{ name: 'test-skill', description: 'A test skill', content: 'instructions', parseError: null }]);
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
    const mockSkillStore = createMockSkillStore(false, [{ name: 'test-skill', description: 'A test skill', content: 'instructions', parseError: null }]);
    const tools = createBuiltinTools({
      confirm: { confirm: async () => true },
      skillStore: mockSkillStore
    });

    const skillTool = tools.find((t) => t.definition.name === 'skill');
    expect(skillTool).toBeUndefined();
  });

  it('excludes skill tool when skillStore has no enabled skills', () => {
    const mockSkillStore = createMockSkillStore(true, []);
    const tools = createBuiltinTools({
      confirm: { confirm: async () => true },
      skillStore: mockSkillStore
    });

    const skillTool = tools.find((t) => t.definition.name === 'skill');
    expect(skillTool).toBeUndefined();
  });
});
