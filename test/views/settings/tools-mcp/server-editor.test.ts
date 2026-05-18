/**
 * @file server-editor.test.ts
 * @description 验证 MCP Server 编辑器 JSON 解析与序列化逻辑。
 */
import { isArray, isObject, pick } from 'lodash-es';
import { describe, expect, it } from 'vitest';
import { DEFAULT_MCP_TOOL_CALL_TIMEOUT_MS } from '@/shared/storage/tool-settings';
import type { MCPServerConfig } from '@/shared/storage/tool-settings';

/**
 * MCP Server 编辑弹窗提交的草稿结构。
 */
interface MCPServerEditorDraft {
  /** 展示名称 */
  name: string;
  /** 启动命令 */
  command: string;
  /** 启动参数 */
  args: string[];
  /** 环境变量 */
  env: Record<string, string>;
  /** 允许暴露的工具名列表 */
  toolAllowlist: string[];
  /** 单次工具调用超时 */
  toolCallTimeoutMs: number;
}

/**
 * JSON 解析结果。
 */
interface MCPServerDraftParseResult {
  /** 解析后的草稿 */
  draft: MCPServerEditorDraft | null;
  /** 解析错误信息 */
  error: string;
}

/**
 * MCP Server JSON 编辑器的占位示例。
 */
const MCP_SERVER_JSON_PLACEHOLDER = `{
  "name": "filesystem",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem"],
  "env": {},
  "toolAllowlist": ["read_file", "list_directory"],
  "toolCallTimeoutMs": 30000
}`;

/**
 * 将任意对象安全转换为字符串字典。
 * @param value - 待转换值
 * @returns 字符串字典
 */
function normalizeStringRecord(value: unknown): Record<string, string> {
  if (!isObject(value) || isArray(value)) {
    return {};
  }

  return Object.fromEntries(Object.entries(value).map(([key, itemValue]) => [String(key), String(itemValue)]));
}

/**
 * 将任意值安全转换为字符串数组。
 * @param value - 待转换值
 * @returns 字符串数组
 */
function normalizeStringArray(value: unknown): string[] {
  return isArray(value) ? value.map((item) => String(item)) : [];
}

/**
 * 将 MCP server 配置序列化为编辑器使用的 JSON。
 * @param server - 当前编辑的 server，空时返回示例 JSON
 * @returns 格式化后的 JSON 字符串
 */
function serializeMCPServerEditorDraft(server: MCPServerConfig | null): string {
  if (!server) {
    return MCP_SERVER_JSON_PLACEHOLDER;
  }

  return JSON.stringify(pick(server, ['name', 'command', 'args', 'env', 'toolAllowlist', 'toolCallTimeoutMs']), null, 2);
}

/**
 * 将 JSON 文本解析为可提交的 MCP server 草稿。
 * @param jsonText - 编辑器中的 JSON 文本
 * @returns 解析结果
 */
function parseMCPServerEditorDraft(jsonText: string): MCPServerDraftParseResult {
  const raw = jsonText.trim();
  if (!raw) {
    return {
      draft: null,
      error: '请输入 MCP Server JSON 配置。'
    };
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.command !== 'string' || !parsed.command.trim()) {
      return {
        draft: null,
        error: '`command` 必须是非空字符串。'
      };
    }

    return {
      draft: {
        name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : 'New MCP Server',
        command: parsed.command.trim(),
        args: normalizeStringArray(parsed.args),
        env: normalizeStringRecord(parsed.env),
        toolAllowlist: normalizeStringArray(parsed.toolAllowlist),
        toolCallTimeoutMs: typeof parsed.toolCallTimeoutMs === 'number' ? parsed.toolCallTimeoutMs : DEFAULT_MCP_TOOL_CALL_TIMEOUT_MS
      },
      error: ''
    };
  } catch (error) {
    return {
      draft: null,
      error: error instanceof Error ? error.message : 'JSON 格式错误'
    };
  }
}

describe('server-editor helpers', () => {
  it('returns a validation error when command is missing', () => {
    const result = parseMCPServerEditorDraft(
      JSON.stringify({
        name: 'filesystem'
      })
    );

    expect(result.draft).toBeNull();
    expect(result.error).toContain('`command`');
  });

  it('normalizes optional fields and falls back to default timeout', () => {
    const result = parseMCPServerEditorDraft(
      JSON.stringify({
        command: 'npx',
        args: ['-y', 123],
        env: {
          ROOT: '/tmp',
          DEBUG: true
        },
        toolAllowlist: ['read_file', 42]
      })
    );

    expect(result.error).toBe('');
    expect(result.draft).toEqual({
      name: 'New MCP Server',
      command: 'npx',
      args: ['-y', '123'],
      env: {
        ROOT: '/tmp',
        DEBUG: 'true'
      },
      toolAllowlist: ['read_file', '42'],
      toolCallTimeoutMs: DEFAULT_MCP_TOOL_CALL_TIMEOUT_MS
    });
  });

  it('serializes an existing server without server-level runtime fields', () => {
    const result = serializeMCPServerEditorDraft({
      id: 'server-1',
      name: 'Filesystem',
      enabled: true,
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem'],
      env: { ROOT: '/tmp' },
      toolAllowlist: ['read_file'],
      connectTimeoutMs: 20000,
      toolCallTimeoutMs: 30000
    } as MCPServerConfig);

    expect(result).toContain('"name": "Filesystem"');
    expect(result).toContain('"toolCallTimeoutMs": 30000');
    expect(result).not.toContain('"enabled"');
    expect(result).not.toContain('"connectTimeoutMs"');
  });
});
