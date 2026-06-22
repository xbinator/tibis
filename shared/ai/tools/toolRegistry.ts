/**
 * @file toolRegistry.ts
 * @description ChatRuntime 已迁移工具定义的跨进程纯元数据 registry。
 */

/** 跨进程工具来源类型。 */
export type SharedToolSource = 'builtin' | 'custom' | 'mcp';

/** 跨进程工具风险等级。 */
export type SharedToolRiskLevel = 'read' | 'write' | 'dangerous';

/** 跨进程工具参数 Schema。 */
export interface SharedToolParameterSchema {
  /** 模式类型，当前工具定义统一使用 object。 */
  type: 'object';
  /** JSON Schema 属性定义。 */
  properties: Record<string, unknown>;
  /** 必需属性名称。 */
  required?: string[];
  /** 是否允许额外属性。 */
  additionalProperties?: boolean;
}

/** 跨进程工具定义。 */
export interface SharedToolDefinition {
  /** 工具名称。 */
  name: string;
  /** 工具描述，兼容动态描述函数。 */
  description: string | (() => string);
  /** 工具来源。 */
  source: SharedToolSource;
  /** 风险等级。 */
  riskLevel: SharedToolRiskLevel;
  /** 参数 Schema。 */
  parameters: SharedToolParameterSchema;
  /** 此工具是否需要当前编辑器文档上下文。 */
  requiresActiveDocument?: boolean;
  /** UI 和策略决策使用的权限类别。 */
  permissionCategory?: 'document' | 'settings' | 'system';
  /** 此写入工具是否可以自动批准并记住。 */
  safeAutoApprove?: boolean;
}

/** 工具运行时归属。 */
export type ToolRuntimeOwner = 'main' | 'renderer' | 'sdk';

/** 主进程工具分组。 */
export type ToolRuntimeGroup = 'read' | 'file' | 'settings' | 'drawing' | 'resource' | 'webview';

/** 工具暴露策略。 */
export type ToolExposure = 'default-readonly' | 'default-writable' | 'conditional-readonly' | 'conditional-writable' | 'compat-hidden';

/** 工具 registry 条目。 */
export interface ToolRegistryEntry {
  /** 工具运行时归属。 */
  runtime: ToolRuntimeOwner;
  /** 主进程工具分组。 */
  group: ToolRuntimeGroup;
  /** 工具暴露策略。 */
  exposure: ToolExposure;
  /** AI 工具定义。 */
  definition: SharedToolDefinition;
}

/** 读取当前文档工具名称。 */
export const READ_CURRENT_DOCUMENT_TOOL_NAME = 'read_current_document';
/** 创建文档工具名称。 */
export const CREATE_DOCUMENT_TOOL_NAME = 'create_document';
/** 创建画板草稿工具名称。 */
export const CREATE_DRAWING_TOOL_NAME = 'create_drawing';
/** 读取当前画板工具名称。 */
export const READ_CURRENT_DRAWING_TOOL_NAME = 'read_current_drawing';
/** 操作当前画板工具名称。 */
export const APPLY_DRAWING_OPERATIONS_TOOL_NAME = 'apply_drawing_operations';
/** 旧版完整更新当前画板工具名称，保留常量用于过滤兼容。 */
export const UPDATE_CURRENT_DRAWING_TOOL_NAME = 'update_current_drawing';
/** 获取当前时间工具名称。 */
export const GET_CURRENT_TIME_TOOL_NAME = 'get_current_time';
/** 编辑文件工具名称。 */
export const EDIT_FILE_TOOL_NAME = 'edit_file';
/** 读取文件工具名称。 */
export const READ_FILE_TOOL_NAME = 'read_file';
/** 读取目录工具名称。 */
export const READ_DIRECTORY_TOOL_NAME = 'read_directory';
/** 写入文件工具名称。 */
export const WRITE_FILE_TOOL_NAME = 'write_file';
/** 查询日志工具名称。 */
export const QUERY_LOGS_TOOL_NAME = 'query_logs';
/** 获取 MCP 设置工具名称。 */
export const GET_MCP_SETTINGS_TOOL_NAME = 'get_mcp_settings';
/** 新增 MCP server 工具名称。 */
export const ADD_MCP_SERVER_TOOL_NAME = 'add_mcp_server';
/** 更新 MCP server 工具名称。 */
export const UPDATE_MCP_SERVER_TOOL_NAME = 'update_mcp_server';
/** 删除 MCP server 工具名称。 */
export const REMOVE_MCP_SERVER_TOOL_NAME = 'remove_mcp_server';
/** 刷新 MCP discovery 工具名称。 */
export const REFRESH_MCP_DISCOVERY_TOOL_NAME = 'refresh_mcp_discovery';
/** 打开资源工具名称。 */
export const OPEN_RESOURCE_TOOL_NAME = 'open_resource';
/** 获取设置工具名称。 */
export const GET_SETTINGS_TOOL_NAME = 'get_settings';
/** 修改设置工具名称。 */
export const UPDATE_SETTINGS_TOOL_NAME = 'update_settings';
/** 读取当前网页工具名称。 */
export const READ_CURRENT_WEBPAGE_TOOL_NAME = 'read_current_webpage';
/** 操作当前网页工具名称。 */
export const OPERATE_WEBPAGE_TOOL_NAME = 'operate_webpage';

/** 支持读取或修改的设置键。 */
const SUPPORTED_SETTING_KEYS = ['theme', 'themePreset', 'sourceMode', 'editorPageWidth'] as const;
/** AI 支持创建的形状类型。 */
const SUPPORTED_DRAWING_SHAPES = ['process', 'decision', 'actor', 'service', 'database', 'text', 'rect', 'ellipse', 'diamond'] as const;
/** AI 支持使用的连接线锚点。 */
const SUPPORTED_CONNECTOR_ANCHORS = ['top', 'right', 'bottom', 'left', 'center'] as const;
/** WebView 支持模拟的按键。 */
const SUPPORTED_WEBPAGE_PRESS_KEYS = ['Enter', 'Tab', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'] as const;

/** 内部 JSON Schema 对象类型。 */
type ToolJsonSchema = Record<string, unknown>;

/** 画板坐标点参数 Schema。 */
const DRAWING_POINT_PARAMETER_SCHEMA: ToolJsonSchema = {
  type: 'object',
  properties: {
    x: { type: 'number' },
    y: { type: 'number' }
  },
  required: ['x', 'y'],
  additionalProperties: false
};

/** 画板尺寸参数 Schema。 */
const DRAWING_SIZE_PARAMETER_SCHEMA: ToolJsonSchema = {
  type: 'object',
  properties: {
    width: { type: 'number', minimum: 0 },
    height: { type: 'number', minimum: 0 }
  },
  required: ['width', 'height'],
  additionalProperties: false
};

/** 画板样式参数 Schema。 */
const DRAWING_STYLE_PARAMETER_SCHEMA: ToolJsonSchema = {
  type: 'object',
  properties: {
    fill: { type: 'string' },
    stroke: { type: 'string' },
    strokeWidth: { type: 'number' },
    color: { type: 'string' },
    fontSize: { type: 'number' },
    fontWeight: { type: 'number' },
    textAlign: { type: 'string', enum: ['left', 'center', 'right'] },
    textVerticalAlign: { type: 'string', enum: ['top', 'middle', 'bottom'] },
    opacity: { type: 'number' }
  },
  additionalProperties: false
};

/** 批量画板操作参数 Schema。 */
const DRAWING_OPERATIONS_PARAMETER_SCHEMA: ToolJsonSchema = {
  type: 'array',
  description:
    '按顺序执行的操作列表。支持 add_shape、update_shape_text、move_shape、add_connector、delete_element。' +
    'add_shape 可传 shape/text/position/size/style；add_connector 可传 sourceId/targetId/sourceAnchor/targetAnchor/label/style。',
  items: {
    oneOf: [
      {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['add_shape'] },
          id: { type: 'string' },
          shape: { type: 'string', enum: SUPPORTED_DRAWING_SHAPES },
          text: { type: 'string' },
          position: DRAWING_POINT_PARAMETER_SCHEMA,
          size: DRAWING_SIZE_PARAMETER_SCHEMA,
          style: DRAWING_STYLE_PARAMETER_SCHEMA
        },
        required: ['type', 'shape', 'position'],
        additionalProperties: false
      },
      {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['update_shape_text'] },
          id: { type: 'string' },
          text: { type: 'string' }
        },
        required: ['type', 'id', 'text'],
        additionalProperties: false
      },
      {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['move_shape'] },
          id: { type: 'string' },
          position: DRAWING_POINT_PARAMETER_SCHEMA
        },
        required: ['type', 'id', 'position'],
        additionalProperties: false
      },
      {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['add_connector'] },
          id: { type: 'string' },
          sourceId: { type: 'string' },
          targetId: { type: 'string' },
          sourceAnchor: { type: 'string', enum: SUPPORTED_CONNECTOR_ANCHORS },
          targetAnchor: { type: 'string', enum: SUPPORTED_CONNECTOR_ANCHORS },
          label: { type: 'string' },
          style: DRAWING_STYLE_PARAMETER_SCHEMA
        },
        required: ['type', 'sourceId', 'targetId'],
        additionalProperties: false
      },
      {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['delete_element'] },
          id: { type: 'string' }
        },
        required: ['type', 'id'],
        additionalProperties: false
      }
    ]
  }
};

/** 网页操作动作参数 Schema。 */
const WEBPAGE_OPERATION_ACTION_SCHEMA: ToolJsonSchema = {
  oneOf: [
    {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['click'] },
        index: { type: 'number', description: '来自 read_current_webpage 最新 snapshot 的元素索引。' }
      },
      required: ['type', 'index'],
      additionalProperties: false
    },
    {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['input'] },
        index: { type: 'number', description: '来自 read_current_webpage 最新 snapshot 的输入元素索引。' },
        text: { type: 'string', description: '要输入的文本。' },
        clear: { type: 'boolean', description: '是否先清空原内容，默认 true。' }
      },
      required: ['type', 'index', 'text'],
      additionalProperties: false
    },
    {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['select'] },
        index: { type: 'number', description: '来自 read_current_webpage 最新 snapshot 的 select 元素索引。' },
        optionText: { type: 'string', description: '要选择的 option 可见文本。存在多个同名 option 时工具会返回歧义错误。' }
      },
      required: ['type', 'index', 'optionText'],
      additionalProperties: false
    },
    {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['press'] },
        index: { type: 'number', description: '来自 read_current_webpage 最新 snapshot 的可聚焦元素索引。' },
        key: { type: 'string', enum: SUPPORTED_WEBPAGE_PRESS_KEYS, description: '要模拟的按键。搜索框回车提交请使用 Enter。' }
      },
      required: ['type', 'index', 'key'],
      additionalProperties: false
    },
    {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['scroll'] },
        index: { type: 'number', description: '可选，来自 read_current_webpage 最新 snapshot 的元素索引；提供时滚动其可滚动祖先。' },
        direction: { type: 'string', enum: ['up', 'down', 'left', 'right'] },
        pixels: { type: 'number', minimum: 1, maximum: 5000 }
      },
      required: ['type', 'direction'],
      additionalProperties: false
    },
    {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['navigate'] },
        url: { type: 'string', description: '要在当前激活 WebView 中打开的 http/https 地址，可省略协议。' }
      },
      required: ['type', 'url'],
      additionalProperties: false
    },
    {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['wait'] },
        seconds: { type: 'number', minimum: 0.1, maximum: 5 }
      },
      required: ['type'],
      additionalProperties: false
    }
  ]
};

/** 已迁移到主进程的工具 registry。 */
export const TOOL_REGISTRY = [
  {
    runtime: 'main',
    group: 'read',
    exposure: 'default-readonly',
    definition: {
      name: READ_CURRENT_DOCUMENT_TOOL_NAME,
      description: '读取当前编辑器文档的标题、路径和 Markdown 内容。',
      source: 'builtin',
      riskLevel: 'read',
      parameters: { type: 'object', properties: {}, additionalProperties: false }
    }
  },
  {
    runtime: 'main',
    group: 'file',
    exposure: 'default-writable',
    definition: {
      name: CREATE_DOCUMENT_TOOL_NAME,
      description: '创建新的编辑器文档（未保存草稿）。提供标题和初始内容，将在编辑器中打开新标签页供用户编辑。',
      source: 'builtin',
      riskLevel: 'write',
      requiresActiveDocument: false,
      permissionCategory: 'document',
      safeAutoApprove: true,
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '文档标题/文件名，如 "README"。' },
          content: { type: 'string', description: '文档的初始内容。' },
          ext: { type: 'string', description: '文件扩展名，默认为 "md"。支持 md、txt、json 等。' }
        },
        required: ['title', 'content'],
        additionalProperties: false
      }
    }
  },
  {
    runtime: 'main',
    group: 'drawing',
    exposure: 'default-writable',
    definition: {
      name: CREATE_DRAWING_TOOL_NAME,
      description:
        '创建新的 BDrawing 画板草稿并打开。可传入初始 operations，一次性创建并绘制初始节点、连线或布局；适合用户要求新建流程图、结构图、思维草图时使用。',
      source: 'builtin',
      riskLevel: 'write',
      requiresActiveDocument: false,
      permissionCategory: 'document',
      safeAutoApprove: true,
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '画板标题/文件名主体，如 "产品流程图"。' },
          operations: {
            ...DRAWING_OPERATIONS_PARAMETER_SCHEMA,
            description: '创建草稿后立即应用的初始画板操作列表。省略时创建空画板。'
          }
        },
        required: ['title'],
        additionalProperties: false
      }
    }
  },
  {
    runtime: 'main',
    group: 'read',
    exposure: 'default-readonly',
    definition: {
      name: READ_CURRENT_DRAWING_TOOL_NAME,
      description: '读取当前画板的文件信息与完整 Drawing JSON 数据。',
      source: 'builtin',
      riskLevel: 'read',
      requiresActiveDocument: false,
      parameters: { type: 'object', properties: {}, additionalProperties: false }
    }
  },
  {
    runtime: 'main',
    group: 'drawing',
    exposure: 'default-writable',
    definition: {
      name: APPLY_DRAWING_OPERATIONS_TOOL_NAME,
      description: '按顺序对当前画板执行结构化操作。优先用于新增形状、移动形状、更新节点文本、创建连线或删除元素；比直接重写完整 Drawing JSON 更安全。',
      source: 'builtin',
      riskLevel: 'write',
      requiresActiveDocument: false,
      permissionCategory: 'document',
      parameters: {
        type: 'object',
        properties: {
          operations: {
            ...DRAWING_OPERATIONS_PARAMETER_SCHEMA
          }
        },
        required: ['operations'],
        additionalProperties: false
      }
    }
  },
  {
    runtime: 'main',
    group: 'read',
    exposure: 'default-readonly',
    definition: {
      name: GET_CURRENT_TIME_TOOL_NAME,
      description: '获取当前系统时间，返回 ISO、时间戳和本地格式化字符串。',
      source: 'builtin',
      riskLevel: 'read',
      permissionCategory: 'system',
      requiresActiveDocument: false,
      parameters: { type: 'object', properties: {}, additionalProperties: false }
    }
  },
  {
    runtime: 'main',
    group: 'file',
    exposure: 'default-readonly',
    definition: {
      name: READ_FILE_TOOL_NAME,
      description: '读取指定本地文本文件内容，可通过 offset 和 limit 滚动读取。相对路径需要工作区根目录，绝对路径需要用户确认（最近文件列表中的路径除外）。',
      source: 'builtin',
      riskLevel: 'read',
      requiresActiveDocument: false,
      permissionCategory: 'system',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径，支持相对工作区路径或绝对路径。' },
          offset: { type: 'number', description: '起始行号，默认 1。' },
          limit: { type: 'number', description: '读取行数；不传时读取到文件末尾。' }
        },
        additionalProperties: false
      }
    }
  },
  {
    runtime: 'main',
    group: 'file',
    exposure: 'conditional-readonly',
    definition: {
      name: READ_DIRECTORY_TOOL_NAME,
      description:
        '读取指定目录下的直接子项列表，仅返回当前目录中的文件和子目录，不递归展开。相对路径需要工作区根目录，绝对路径需要用户确认（最近文件列表中的路径除外）。',
      source: 'builtin',
      riskLevel: 'read',
      requiresActiveDocument: false,
      permissionCategory: 'system',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '目录路径，支持相对工作区路径或绝对路径。' }
        },
        required: ['path'],
        additionalProperties: false
      }
    }
  },
  {
    runtime: 'main',
    group: 'file',
    exposure: 'default-writable',
    definition: {
      name: WRITE_FILE_TOOL_NAME,
      description: '创建或覆盖本地文本文件或未保存草稿。执行前会向用户展示确认信息。',
      source: 'builtin',
      riskLevel: 'write',
      requiresActiveDocument: false,
      permissionCategory: 'system',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径，支持相对工作区路径、绝对路径或未保存草稿虚拟路径。' },
          content: { type: 'string', description: '新的完整文件内容。' }
        },
        required: ['path', 'content'],
        additionalProperties: false
      }
    }
  },
  {
    runtime: 'main',
    group: 'file',
    exposure: 'default-writable',
    definition: {
      name: EDIT_FILE_TOOL_NAME,
      description: '按精确字符串匹配修改本地文本文件或未保存草稿。执行前会向用户展示确认信息。',
      source: 'builtin',
      riskLevel: 'write',
      requiresActiveDocument: false,
      permissionCategory: 'system',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径，支持相对工作区路径、绝对路径或未保存草稿虚拟路径。' },
          oldString: { type: 'string', description: '待替换的原始文本。' },
          newString: { type: 'string', description: '替换后的文本。' },
          replaceAll: { type: 'boolean', description: '是否替换全部匹配项，默认 false。' }
        },
        required: ['path', 'oldString', 'newString'],
        additionalProperties: false
      }
    }
  },
  {
    runtime: 'main',
    group: 'read',
    exposure: 'default-readonly',
    definition: {
      name: QUERY_LOGS_TOOL_NAME,
      description:
        '查询应用运行日志，可按级别、进程来源、关键字、日期和分页参数筛选，适合排查当天错误、查找异常上下文和定位指定关键字日志。未传日期时默认查询当天日志，不会修改任何数据。',
      source: 'builtin',
      riskLevel: 'read',
      permissionCategory: 'system',
      requiresActiveDocument: false,
      parameters: {
        type: 'object',
        properties: {
          level: { type: 'string', enum: ['ERROR', 'WARN', 'INFO'], description: '日志级别筛选。' },
          scope: { type: 'string', enum: ['main', 'renderer', 'preload'], description: '日志来源筛选。' },
          keyword: { type: 'string', description: '按消息内容执行大小写不敏感的关键字匹配。' },
          date: { type: 'string', description: '查询日期，格式为 YYYY-MM-DD；不传时默认查询当天日志。' },
          limit: { type: 'number', description: '返回条数，默认 50，最大 100。' },
          offset: { type: 'number', description: '过滤后结果集的分页偏移量，默认 0。' }
        },
        additionalProperties: false
      }
    }
  },
  {
    runtime: 'main',
    group: 'settings',
    exposure: 'default-readonly',
    definition: {
      name: GET_SETTINGS_TOOL_NAME,
      description: '获取应用设置。可获取主题外观、主题色、源码模式和编辑器页宽等设置项的当前值。支持传入单个 key、key 数组或不传（返回所有设置）。',
      source: 'builtin',
      riskLevel: 'read',
      permissionCategory: 'settings',
      safeAutoApprove: true,
      requiresActiveDocument: false,
      parameters: {
        type: 'object',
        properties: {
          keys: {
            oneOf: [
              { type: 'string', enum: SUPPORTED_SETTING_KEYS },
              { type: 'array', items: { type: 'string', enum: SUPPORTED_SETTING_KEYS } }
            ],
            description: '要获取的设置键，支持单个字符串或数组，不传则返回所有设置。'
          }
        },
        additionalProperties: false
      }
    }
  },
  {
    runtime: 'main',
    group: 'settings',
    exposure: 'default-writable',
    definition: {
      name: UPDATE_SETTINGS_TOOL_NAME,
      description: '修改应用设置。可根据自然语言请求设置主题外观、主题色、源码模式和编辑器页宽。',
      source: 'builtin',
      riskLevel: 'write',
      permissionCategory: 'settings',
      safeAutoApprove: true,
      requiresActiveDocument: false,
      parameters: {
        type: 'object',
        properties: {
          key: { type: 'string', enum: SUPPORTED_SETTING_KEYS, description: '要修改的设置键。' },
          value: {
            type: ['string', 'boolean'],
            description:
              '设置值：theme 使用 dark/light/system；themePreset 使用预设 ID（如 default、everforest、tokyonight 等）；editorPageWidth 使用 default/wide/full；布尔设置使用 true/false。'
          }
        },
        required: ['key', 'value'],
        additionalProperties: false
      }
    }
  },
  {
    runtime: 'main',
    group: 'settings',
    exposure: 'conditional-readonly',
    definition: {
      name: GET_MCP_SETTINGS_TOOL_NAME,
      description: '获取当前 MCP 配置，包括本地 stdio server、命令、参数、环境变量、allowlist 与超时设置。',
      source: 'builtin',
      riskLevel: 'read',
      permissionCategory: 'settings',
      safeAutoApprove: true,
      requiresActiveDocument: false,
      parameters: { type: 'object', properties: {}, additionalProperties: false }
    }
  },
  {
    runtime: 'main',
    group: 'settings',
    exposure: 'conditional-writable',
    definition: {
      name: ADD_MCP_SERVER_TOOL_NAME,
      description: '新增一个本地 stdio MCP server 配置。该工具只写入配置，不会立即执行 server。',
      source: 'builtin',
      riskLevel: 'write',
      permissionCategory: 'settings',
      safeAutoApprove: false,
      requiresActiveDocument: false,
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '展示名称。' },
          enabled: { type: 'boolean', description: '是否启用，默认 true。' },
          command: { type: 'string', description: '本地启动命令，例如 npx、node、python。' },
          args: { type: 'array', items: { type: 'string' }, description: '启动参数。' },
          env: { type: 'object', additionalProperties: { type: 'string' }, description: '环境变量字典。' },
          toolAllowlist: { type: 'array', items: { type: 'string' }, description: '允许暴露的 MCP tool 名称，空数组表示不额外限制。' },
          connectTimeoutMs: { type: 'number', description: '连接与握手超时，单位毫秒。' },
          toolCallTimeoutMs: { type: 'number', description: '工具调用超时，单位毫秒。' }
        },
        required: ['command'],
        additionalProperties: false
      }
    }
  },
  {
    runtime: 'main',
    group: 'settings',
    exposure: 'conditional-writable',
    definition: {
      name: UPDATE_MCP_SERVER_TOOL_NAME,
      description: '更新一个本地 stdio MCP server 配置。',
      source: 'builtin',
      riskLevel: 'write',
      permissionCategory: 'settings',
      safeAutoApprove: false,
      requiresActiveDocument: false,
      parameters: {
        type: 'object',
        properties: {
          serverId: { type: 'string', description: 'MCP server ID。' },
          patch: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              enabled: { type: 'boolean' },
              command: { type: 'string' },
              args: { type: 'array', items: { type: 'string' } },
              env: { type: 'object', additionalProperties: { type: 'string' } },
              toolAllowlist: { type: 'array', items: { type: 'string' } },
              connectTimeoutMs: { type: 'number' },
              toolCallTimeoutMs: { type: 'number' }
            },
            additionalProperties: false
          }
        },
        required: ['serverId', 'patch'],
        additionalProperties: false
      }
    }
  },
  {
    runtime: 'main',
    group: 'settings',
    exposure: 'conditional-writable',
    definition: {
      name: REMOVE_MCP_SERVER_TOOL_NAME,
      description: '删除一个本地 MCP server 配置。',
      source: 'builtin',
      riskLevel: 'write',
      permissionCategory: 'settings',
      safeAutoApprove: false,
      requiresActiveDocument: false,
      parameters: {
        type: 'object',
        properties: {
          serverId: { type: 'string', description: 'MCP server ID。' }
        },
        required: ['serverId'],
        additionalProperties: false
      }
    }
  },
  {
    runtime: 'main',
    group: 'settings',
    exposure: 'conditional-writable',
    definition: {
      name: REFRESH_MCP_DISCOVERY_TOOL_NAME,
      description: '刷新指定 MCP server 的工具发现缓存。该操作会在本地启动配置的 stdio MCP server 并执行 tools/list。',
      source: 'builtin',
      riskLevel: 'write',
      permissionCategory: 'settings',
      safeAutoApprove: false,
      requiresActiveDocument: false,
      parameters: {
        type: 'object',
        properties: {
          serverId: { type: 'string', description: 'MCP server ID。' }
        },
        required: ['serverId'],
        additionalProperties: false
      }
    }
  },
  {
    runtime: 'main',
    group: 'resource',
    exposure: 'default-readonly',
    definition: {
      name: OPEN_RESOURCE_TOOL_NAME,
      description:
        '根据用户指令打开文件或外部链接。文件路径支持相对工作区路径或绝对路径（外部路径需用户确认）；mailto/ftp 链接使用系统默认程序打开；' +
        '仅当没有激活 WebView 且用户要创建新的内置浏览器页时，才用它打开 http/https 网址。若当前已有激活 WebView，要打开或切换网页请使用 operate_webpage 的 navigate 动作。',
      source: 'builtin',
      riskLevel: 'read',
      requiresActiveDocument: false,
      permissionCategory: 'system',
      safeAutoApprove: true,
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径（支持相对工作区路径或绝对路径）或网址（http/https/mailto/ftp）。' }
        },
        required: ['path'],
        additionalProperties: false
      }
    }
  },
  {
    runtime: 'main',
    group: 'webview',
    exposure: 'conditional-readonly',
    definition: {
      name: READ_CURRENT_WEBPAGE_TOOL_NAME,
      description:
        '读取当前内置 WebView 页面的标题、URL、页面位置提示、简化 DOM 结构、当前视口可见元素、顶层浮层/弹窗、可见文本、选中文本、标题结构、链接摘要、滚动状态和可操作元素索引。' +
        '需要操作网页前必须先调用此工具获取 snapshotId 和元素 index；若存在顶层浮层，应优先使用 viewport.topLayer 内的元素。',
      source: 'builtin',
      riskLevel: 'read',
      requiresActiveDocument: false,
      permissionCategory: 'system',
      parameters: { type: 'object', properties: {}, additionalProperties: false }
    }
  },
  {
    runtime: 'main',
    group: 'webview',
    exposure: 'conditional-writable',
    definition: {
      name: OPERATE_WEBPAGE_TOOL_NAME,
      description:
        '操作当前激活 WebView 页面。打开或切换网页可直接使用 navigate，无需 snapshotId；wait 以及点击、输入、选择、元素滚动必须先调用 read_current_webpage，元素动作还要使用返回的 index。' +
        '支持 click、input、select、press、scroll、navigate、wait；搜索框输入后需要回车时使用 press Enter；打开或切换当前网页请使用 navigate；不接受 CSS selector 或任意 JavaScript。',
      source: 'builtin',
      riskLevel: 'write',
      requiresActiveDocument: false,
      permissionCategory: 'system',
      safeAutoApprove: false,
      parameters: {
        type: 'object',
        properties: {
          snapshotId: { type: 'string', description: 'read_current_webpage 返回的 snapshotId；非 navigate 动作必须提供。' },
          action: WEBPAGE_OPERATION_ACTION_SCHEMA
        },
        required: ['action'],
        additionalProperties: false
      }
    }
  }
] as const satisfies ToolRegistryEntry[];

/**
 * 按名称读取工具定义。
 * @param toolName - 工具名称
 * @returns 工具定义
 */
export function getToolDefinitionByName(toolName: string): SharedToolDefinition | undefined {
  return TOOL_REGISTRY.find((entry) => entry.definition.name === toolName)?.definition;
}

/**
 * 按 runtime 和 group 派生工具名称。
 * @param runtime - 工具运行时归属
 * @param group - 工具分组
 * @returns 工具名称列表
 */
export function getToolNamesByRuntimeGroup(runtime: ToolRuntimeOwner, group: ToolRuntimeGroup): string[] {
  return TOOL_REGISTRY.filter((entry) => entry.runtime === runtime && entry.group === group).map((entry) => entry.definition.name);
}

/**
 * 按 renderer 暴露策略派生工具名称。
 * @param exposure - 工具暴露策略
 * @returns 工具名称列表
 */
export function getToolNamesByExposure(exposure: ToolExposure): string[] {
  return TOOL_REGISTRY.filter((entry) => entry.exposure === exposure).map((entry) => entry.definition.name);
}
