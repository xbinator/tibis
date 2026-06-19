/**
 * @file constants.mts
 * @description ChatRuntime 主进程工具常量。
 */

/** 读取当前文档的内置工具名称。 */
export const READ_CURRENT_DOCUMENT_TOOL_NAME = 'read_current_document';

/** 读取当前画板的内置工具名称。 */
export const READ_CURRENT_DRAWING_TOOL_NAME = 'read_current_drawing';

/** 读取当前网页的内置工具名称。 */
export const READ_CURRENT_WEBPAGE_TOOL_NAME = 'read_current_webpage';

/** 获取当前时间的内置工具名称。 */
export const GET_CURRENT_TIME_TOOL_NAME = 'get_current_time';

/** 查询日志的内置工具名称。 */
export const QUERY_LOGS_TOOL_NAME = 'query_logs';

/** 读取文件的内置工具名称。 */
export const READ_FILE_TOOL_NAME = 'read_file';

/** 读取目录的内置工具名称。 */
export const READ_DIRECTORY_TOOL_NAME = 'read_directory';

/** 获取设置的内置工具名称。 */
export const GET_SETTINGS_TOOL_NAME = 'get_settings';

/** 获取 MCP 设置的内置工具名称。 */
export const GET_MCP_SETTINGS_TOOL_NAME = 'get_mcp_settings';

/** 新增 MCP server 的内置工具名称。 */
export const ADD_MCP_SERVER_TOOL_NAME = 'add_mcp_server';

/** 更新 MCP server 的内置工具名称。 */
export const UPDATE_MCP_SERVER_TOOL_NAME = 'update_mcp_server';

/** 删除 MCP server 的内置工具名称。 */
export const REMOVE_MCP_SERVER_TOOL_NAME = 'remove_mcp_server';

/** 刷新 MCP discovery 的内置工具名称。 */
export const REFRESH_MCP_DISCOVERY_TOOL_NAME = 'refresh_mcp_discovery';

/** 打开资源的内置工具名称。 */
export const OPEN_RESOURCE_TOOL_NAME = 'open_resource';

/** 修改设置的内置工具名称。 */
export const UPDATE_SETTINGS_TOOL_NAME = 'update_settings';

/** 创建文档的内置工具名称。 */
export const CREATE_DOCUMENT_TOOL_NAME = 'create_document';

/** 写入文件的内置工具名称。 */
export const WRITE_FILE_TOOL_NAME = 'write_file';

/** 编辑文件的内置工具名称。 */
export const EDIT_FILE_TOOL_NAME = 'edit_file';

/** 创建画板的内置工具名称。 */
export const CREATE_DRAWING_TOOL_NAME = 'create_drawing';

/** 操作当前画板的内置工具名称。 */
export const APPLY_DRAWING_OPERATIONS_TOOL_NAME = 'apply_drawing_operations';

/** 主进程可执行工具名称集合。 */
export const MAIN_PROCESS_TOOL_NAMES = new Set([
  READ_CURRENT_DOCUMENT_TOOL_NAME,
  READ_CURRENT_DRAWING_TOOL_NAME,
  READ_CURRENT_WEBPAGE_TOOL_NAME,
  GET_CURRENT_TIME_TOOL_NAME,
  QUERY_LOGS_TOOL_NAME,
  READ_FILE_TOOL_NAME,
  READ_DIRECTORY_TOOL_NAME,
  GET_SETTINGS_TOOL_NAME,
  GET_MCP_SETTINGS_TOOL_NAME,
  ADD_MCP_SERVER_TOOL_NAME,
  UPDATE_MCP_SERVER_TOOL_NAME,
  REMOVE_MCP_SERVER_TOOL_NAME,
  REFRESH_MCP_DISCOVERY_TOOL_NAME,
  OPEN_RESOURCE_TOOL_NAME,
  UPDATE_SETTINGS_TOOL_NAME,
  CREATE_DOCUMENT_TOOL_NAME,
  WRITE_FILE_TOOL_NAME,
  EDIT_FILE_TOOL_NAME,
  CREATE_DRAWING_TOOL_NAME,
  APPLY_DRAWING_OPERATIONS_TOOL_NAME
]);

/** 默认文件读取起始行。 */
export const DEFAULT_READ_FILE_OFFSET = 1;

/** 日志查询默认返回条数。 */
export const DEFAULT_QUERY_LOG_LIMIT = 50;

/** 日志查询最大返回条数。 */
export const MAX_QUERY_LOG_LIMIT = 100;

/** settings 文件名。 */
export const RUNTIME_SETTINGS_FILE_NAME = 'settings.json';

/** MCP 默认连接超时时间。 */
export const DEFAULT_MCP_CONNECT_TIMEOUT_MS = 20_000;

/** MCP 默认工具调用超时时间。 */
export const DEFAULT_MCP_TOOL_CALL_TIMEOUT_MS = 30_000;

/** MCP 最小连接超时时间。 */
export const MIN_CONNECT_TIMEOUT_MS = 1_000;

/** MCP 最大连接超时时间。 */
export const MAX_CONNECT_TIMEOUT_MS = 120_000;

/** MCP 最小工具调用超时时间。 */
export const MIN_TOOL_CALL_TIMEOUT_MS = 1_000;

/** MCP 最大工具调用超时时间。 */
export const MAX_TOOL_CALL_TIMEOUT_MS = 120_000;

/** URL 协议正则。 */
export const RUNTIME_URL_PROTOCOL_RE = /^(https?|mailto|ftp):\/\//i;

/** Runtime 可读取的设置键。 */
export const SUPPORTED_SETTING_KEYS = ['theme', 'themePreset', 'sourceMode', 'editorPageWidth'] as const;
