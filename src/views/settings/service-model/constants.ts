export interface VariableOption {
  value: string;
  label: string;
}

export interface ServiceConfigOption {
  type: 'variable';
  options: VariableOption[];
}

export const POLISH_SERVICE_CONFIG_OPTIONS: ServiceConfigOption[] = [
  {
    type: 'variable',
    options: [
      { value: 'SELECTED_TEXT', label: '选中文本' },
      { value: 'USER_INPUT', label: '用户指令' }
    ]
  }
];

export const POLISH_DEFAULT_PROMPT = `# Role
你是一个 Markdown 内容编辑助手。

# Task
根据用户的指令，对下方 Markdown 内容进行修改。

# Rules
1. 仅输出修改后的 Markdown 内容，不要包含任何分隔符或额外标记
2. 保持原有 Markdown 语法结构
3. 不要新增解释性文字

# Original Content
{{SELECTED_TEXT}}

# User Instruction
{{USER_INPUT}} `;

export const CHAT_SERVICE_CONFIG_OPTIONS: ServiceConfigOption[] = [];

export const TOPIC_NAMING_SERVICE_CONFIG_OPTIONS: ServiceConfigOption[] = [
  {
    type: 'variable',
    options: [{ value: 'INPUT_CONTENT', label: '输入内容' }]
  }
];

export const TOPIC_NAMING_DEFAULT_PROMPT = `# Role
你是一个话题命名助手。

# Task
根据提供的聊天内容，生成一个简洁、准确的话题名称。

# Rules
1. 仅输出话题名称，不要包含任何额外文字或解释
2. 名称应简洁明了，不超过20个字符
3. 使用中文命名，体现聊天主题

# Chat Content
{{INPUT_CONTENT}}`;
