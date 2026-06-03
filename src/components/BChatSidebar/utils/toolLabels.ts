/** 内置工具对应的用户可读动作文案。 */
export const TOOL_ACTION_LABELS: Record<string, { alias: string }> = {
  read_file: { alias: '读取文件' },
  read_current_document: { alias: '读取当前文档' },
  read_current_webpage: { alias: '读取当前网页' },
  read_directory: { alias: '读取目录' },
  list_files: { alias: '查看文件列表' },
  search_files: { alias: '搜索文件' },
  write_file: { alias: '写入文件' },
  edit_file: { alias: '修改文件' },
  edit_memory: { alias: '管理记忆' },
  run_shell_command: { alias: '终端命令' },
  get_current_time: { alias: '获取当前时间' },
  get_settings: { alias: '获取设置' },
  get_mcp_settings: { alias: '获取 MCP 设置' },
  update_settings: { alias: '更新设置' },
  add_mcp_server: { alias: '添加 MCP 服务器' },
  update_mcp_server: { alias: '更新 MCP 服务器' },
  remove_mcp_server: { alias: '移除 MCP 服务器' },
  refresh_mcp_discovery: { alias: '刷新 MCP 发现' },
  query_logs: { alias: '查询日志' },
  skill: { alias: '调用技能' },
  question: { alias: '提问' },
  ask_user_question: { alias: '提问' },
  todowrite: { alias: '更新任务列表' },
  create_document: { alias: '创建文档' },
  tavily_search: { alias: '搜索网页' },
  tavily_extract: { alias: '提取网页内容' },
  open_draft: { alias: '打开草稿' },
  open_resource: { alias: '打开资源' }
};

/**
 * 获取工具对应的用户可读动作。
 * @param toolName - 内部工具名称
 * @returns 用户可读动作文案
 */
export function getActionLabel(toolName: string): { alias: string } {
  return TOOL_ACTION_LABELS[toolName] ?? { alias: toolName };
}
