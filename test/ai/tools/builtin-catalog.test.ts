/**
 * @file builtin-catalog.test.ts
 * @description 内置工具清单测试。
 */
import { describe, expect, it } from 'vitest';
import {
  ADD_MCP_SERVER_TOOL_NAME,
  ASK_USER_QUESTION_TOOL_NAME,
  DEFAULT_BUILTIN_READONLY_TOOL_NAMES,
  DEFAULT_BUILTIN_WRITABLE_TOOL_NAMES,
  EDIT_FILE_TOOL_NAME,
  GET_CURRENT_TIME_TOOL_NAME,
  GET_MCP_SETTINGS_TOOL_NAME,
  GET_SETTINGS_TOOL_NAME,
  QUERY_LOGS_TOOL_NAME,
  READ_CURRENT_DOCUMENT_TOOL_NAME,
  READ_DIRECTORY_TOOL_NAME,
  READ_FILE_TOOL_NAME,
  REFRESH_MCP_DISCOVERY_TOOL_NAME,
  REMOVE_MCP_SERVER_TOOL_NAME,
  UPDATE_MCP_SERVER_TOOL_NAME,
  UPDATE_SETTINGS_TOOL_NAME,
  WRITE_FILE_TOOL_NAME,
  getDefaultBuiltinChatToolNames,
  isDefaultBuiltinReadonlyToolName,
  isDefaultBuiltinWritableToolName
} from '@/ai/tools/builtin';

describe('built-in tool catalog', () => {
  it('exposes the default readonly tool names', () => {
    expect([...DEFAULT_BUILTIN_READONLY_TOOL_NAMES]).toEqual([
      READ_CURRENT_DOCUMENT_TOOL_NAME,
      GET_CURRENT_TIME_TOOL_NAME,
      ASK_USER_QUESTION_TOOL_NAME,
      READ_FILE_TOOL_NAME,
      READ_DIRECTORY_TOOL_NAME,
      GET_SETTINGS_TOOL_NAME,
      GET_MCP_SETTINGS_TOOL_NAME,
      QUERY_LOGS_TOOL_NAME
    ]);
  });

  it('exposes the default low-risk writable tool names', () => {
    expect([...DEFAULT_BUILTIN_WRITABLE_TOOL_NAMES]).toEqual([
      EDIT_FILE_TOOL_NAME,
      WRITE_FILE_TOOL_NAME,
      UPDATE_SETTINGS_TOOL_NAME,
      ADD_MCP_SERVER_TOOL_NAME,
      UPDATE_MCP_SERVER_TOOL_NAME,
      REMOVE_MCP_SERVER_TOOL_NAME,
      REFRESH_MCP_DISCOVERY_TOOL_NAME
    ]);
  });

  it('combines readonly and writable tools for chat defaults', () => {
    expect(getDefaultBuiltinChatToolNames()).toEqual([
      READ_CURRENT_DOCUMENT_TOOL_NAME,
      GET_CURRENT_TIME_TOOL_NAME,
      ASK_USER_QUESTION_TOOL_NAME,
      READ_FILE_TOOL_NAME,
      READ_DIRECTORY_TOOL_NAME,
      GET_SETTINGS_TOOL_NAME,
      GET_MCP_SETTINGS_TOOL_NAME,
      QUERY_LOGS_TOOL_NAME,
      EDIT_FILE_TOOL_NAME,
      WRITE_FILE_TOOL_NAME,
      UPDATE_SETTINGS_TOOL_NAME,
      ADD_MCP_SERVER_TOOL_NAME,
      UPDATE_MCP_SERVER_TOOL_NAME,
      REMOVE_MCP_SERVER_TOOL_NAME,
      REFRESH_MCP_DISCOVERY_TOOL_NAME
    ]);
  });

  it('checks readonly tool membership from the shared catalog', () => {
    expect(isDefaultBuiltinReadonlyToolName(GET_CURRENT_TIME_TOOL_NAME)).toBe(true);
    expect(isDefaultBuiltinReadonlyToolName(ASK_USER_QUESTION_TOOL_NAME)).toBe(true);
    expect(isDefaultBuiltinReadonlyToolName(READ_FILE_TOOL_NAME)).toBe(true);
    expect(isDefaultBuiltinReadonlyToolName(READ_DIRECTORY_TOOL_NAME)).toBe(true);
    expect(isDefaultBuiltinReadonlyToolName(GET_SETTINGS_TOOL_NAME)).toBe(true);
    expect(isDefaultBuiltinReadonlyToolName(EDIT_FILE_TOOL_NAME)).toBe(false);
  });

  it('checks writable tool membership from the shared catalog', () => {
    expect(isDefaultBuiltinWritableToolName(EDIT_FILE_TOOL_NAME)).toBe(true);
    expect(isDefaultBuiltinWritableToolName(WRITE_FILE_TOOL_NAME)).toBe(true);
    expect(isDefaultBuiltinWritableToolName('replace_document')).toBe(false);
  });
});
