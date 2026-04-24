/**
 * @file builtin-catalog.test.ts
 * @description 内置工具清单测试。
 */
import { describe, expect, it } from 'vitest';
import { ASK_USER_CHOICE_TOOL_NAME } from '@/ai/tools/builtin/ask-user-choice';
import {
  DEFAULT_BUILTIN_READONLY_TOOL_NAMES,
  DEFAULT_BUILTIN_WRITABLE_TOOL_NAMES,
  getDefaultBuiltinChatToolNames,
  isDefaultBuiltinReadonlyToolName,
  isDefaultBuiltinWritableToolName
} from '@/ai/tools/builtin/catalog';
import { GET_CURRENT_TIME_TOOL_NAME } from '@/ai/tools/builtin/environment';
import { READ_CURRENT_DOCUMENT_TOOL_NAME, SEARCH_CURRENT_DOCUMENT_TOOL_NAME } from '@/ai/tools/builtin/read';
import { READ_DIRECTORY_TOOL_NAME, READ_FILE_TOOL_NAME } from '@/ai/tools/builtin/read-file';
import { GET_SETTINGS_TOOL_NAME, UPDATE_SETTINGS_TOOL_NAME } from '@/ai/tools/builtin/settings';
import { INSERT_AT_CURSOR_TOOL_NAME } from '@/ai/tools/builtin/write';

describe('built-in tool catalog', () => {
  it('exposes the default readonly tool names', () => {
    expect([...DEFAULT_BUILTIN_READONLY_TOOL_NAMES]).toEqual([
      READ_CURRENT_DOCUMENT_TOOL_NAME,
      GET_CURRENT_TIME_TOOL_NAME,
      SEARCH_CURRENT_DOCUMENT_TOOL_NAME,
      ASK_USER_CHOICE_TOOL_NAME,
      READ_FILE_TOOL_NAME,
      READ_DIRECTORY_TOOL_NAME,
      GET_SETTINGS_TOOL_NAME
    ]);
  });

  it('exposes the default low-risk writable tool names', () => {
    expect([...DEFAULT_BUILTIN_WRITABLE_TOOL_NAMES]).toEqual([INSERT_AT_CURSOR_TOOL_NAME, UPDATE_SETTINGS_TOOL_NAME]);
  });

  it('combines readonly and writable tools for chat defaults', () => {
    expect(getDefaultBuiltinChatToolNames()).toEqual([
      READ_CURRENT_DOCUMENT_TOOL_NAME,
      GET_CURRENT_TIME_TOOL_NAME,
      SEARCH_CURRENT_DOCUMENT_TOOL_NAME,
      ASK_USER_CHOICE_TOOL_NAME,
      READ_FILE_TOOL_NAME,
      READ_DIRECTORY_TOOL_NAME,
      GET_SETTINGS_TOOL_NAME,
      INSERT_AT_CURSOR_TOOL_NAME,
      UPDATE_SETTINGS_TOOL_NAME
    ]);
  });

  it('checks readonly tool membership from the shared catalog', () => {
    expect(isDefaultBuiltinReadonlyToolName(GET_CURRENT_TIME_TOOL_NAME)).toBe(true);
    expect(isDefaultBuiltinReadonlyToolName(ASK_USER_CHOICE_TOOL_NAME)).toBe(true);
    expect(isDefaultBuiltinReadonlyToolName(READ_FILE_TOOL_NAME)).toBe(true);
    expect(isDefaultBuiltinReadonlyToolName(READ_DIRECTORY_TOOL_NAME)).toBe(true);
    expect(isDefaultBuiltinReadonlyToolName(GET_SETTINGS_TOOL_NAME)).toBe(true);
    expect(isDefaultBuiltinReadonlyToolName(INSERT_AT_CURSOR_TOOL_NAME)).toBe(false);
  });

  it('checks writable tool membership from the shared catalog', () => {
    expect(isDefaultBuiltinWritableToolName(INSERT_AT_CURSOR_TOOL_NAME)).toBe(true);
    expect(isDefaultBuiltinWritableToolName('replace_selection')).toBe(false);
  });
});
