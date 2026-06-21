/**
 * @file defaults
 * @description AI 服务商与默认模型配置
 */
import type { AIProvider } from 'types/ai';

export const DEFAULT_PROVIDERS: AIProvider[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: '提供 Claude 系列模型，擅长长文本理解、分析推理和高质量写作。',
    baseUrl: 'https://api.anthropic.com',
    type: 'anthropic',
    isEnabled: false,
    readonly: true,
    models: [
      {
        id: 'claude-opus-4-8',
        name: 'Claude Opus 4.8',
        type: 'reasoning',
        isEnabled: true,
        contextWindow: 1000000,
        supportsTools: true,
        supportsVision: true,
        supportsDeepThought: true,
        supportsWebSearch: true,
        supportsImageGeneration: false,
        supportsVideoRecognition: false
      },
      {
        id: 'claude-sonnet-4-6',
        name: 'Claude Sonnet 4.6',
        type: 'reasoning',
        isEnabled: true,
        contextWindow: 1000000,
        supportsTools: true,
        supportsVision: true,
        supportsDeepThought: true,
        supportsWebSearch: true,
        supportsImageGeneration: false,
        supportsVideoRecognition: false
      },
      {
        id: 'claude-haiku-4-5',
        name: 'Claude Haiku 4.5',
        type: 'chat',
        isEnabled: true,
        contextWindow: 1000000,
        supportsTools: true,
        supportsVision: true,
        supportsDeepThought: false,
        supportsWebSearch: true,
        supportsImageGeneration: false,
        supportsVideoRecognition: false
      }
    ]
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    description: '提供高性能推理与代码生成模型，适用于编程辅助和复杂逻辑任务。',
    baseUrl: 'https://api.deepseek.com/v1',
    type: 'deepseek',
    isEnabled: false,
    readonly: true,
    models: [
      {
        id: 'deepseek-v4-pro',
        name: 'DeepSeek V4 Pro',
        type: 'reasoning',
        isEnabled: true,
        contextWindow: 1000000,
        supportsTools: true,
        supportsVision: true,
        supportsDeepThought: true,
        supportsWebSearch: false,
        supportsImageGeneration: false,
        supportsVideoRecognition: false
      },
      {
        id: 'deepseek-v4-flash',
        name: 'DeepSeek V4 Flash',
        type: 'chat',
        isEnabled: true,
        contextWindow: 1000000,
        supportsTools: true,
        supportsVision: true,
        supportsDeepThought: true,
        supportsWebSearch: false,
        supportsImageGeneration: false,
        supportsVideoRecognition: false
      }
    ]
  },
  {
    id: 'google',
    name: 'Google AI',
    description: '提供 Gemini 系列模型，支持多模态处理、搜索增强与高效推理能力。',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    type: 'openai',
    isEnabled: false,
    readonly: true,
    models: [
      {
        id: 'gemini-3.5-pro',
        name: 'Gemini 3.5 Pro',
        type: 'reasoning',
        isEnabled: true,
        contextWindow: 2000000,
        supportsTools: true,
        supportsVision: true,
        supportsDeepThought: true,
        supportsWebSearch: true,
        supportsImageGeneration: false,
        supportsVideoRecognition: true
      },
      {
        id: 'gemini-3.5-flash',
        name: 'Gemini 3.5 Flash',
        type: 'chat',
        isEnabled: true,
        contextWindow: 1000000,
        supportsTools: true,
        supportsVision: true,
        supportsDeepThought: true,
        supportsWebSearch: true,
        supportsImageGeneration: false,
        supportsVideoRecognition: true
      },
      {
        id: 'imagen-4.0-generate-preview-06-06',
        name: 'Imagen 4',
        type: 'image',
        isEnabled: true,
        supportsTools: false,
        supportsVision: false,
        supportsDeepThought: false,
        supportsWebSearch: false,
        supportsImageGeneration: true,
        supportsVideoRecognition: false
      }
    ]
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    description: '提供 MiniMax 系列模型，支持超长上下文、原生多模态与 Agent 能力。',
    baseUrl: 'https://api.minimaxi.com/v1',
    type: 'openai',
    isEnabled: false,
    readonly: true,
    models: [
      {
        id: 'MiniMax-M3',
        name: 'MiniMax M3',
        type: 'reasoning',
        isEnabled: true,
        contextWindow: 1000000,
        supportsTools: true,
        supportsVision: true,
        supportsDeepThought: true,
        supportsWebSearch: true,
        supportsImageGeneration: false,
        supportsVideoRecognition: true
      }
    ]
  },
  {
    id: 'moonshot',
    name: 'Moonshot',
    description: '提供 Kimi 系列大模型，擅长长上下文处理、Agent 协作与代码生成。',
    baseUrl: 'https://api.moonshot.cn/v1',
    type: 'openai',
    isEnabled: false,
    readonly: true,
    models: [
      {
        id: 'kimi-k2.6',
        name: 'Kimi K2.6',
        type: 'reasoning',
        isEnabled: true,
        contextWindow: 256000,
        supportsTools: true,
        supportsVision: true,
        supportsDeepThought: true,
        supportsWebSearch: true,
        supportsImageGeneration: false,
        supportsVideoRecognition: false
      }
    ]
  },
  {
    id: 'ollama',
    name: 'Ollama',
    description: '提供本地部署的 AI 模型，支持自定义训练与推理。',
    baseUrl: 'http://localhost:11434/v1',
    type: 'openai',
    isEnabled: false,
    readonly: true,
    models: []
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: '提供 GPT 系列模型，适用于通用对话、内容生成、代码辅助与多模态能力。',
    baseUrl: 'https://api.openai.com/v1',
    type: 'openai',
    isEnabled: false,
    readonly: true,
    models: [
      {
        id: 'gpt-5.5-pro',
        name: 'GPT-5.5 Pro',
        type: 'reasoning',
        isEnabled: true,
        contextWindow: 400000,
        supportsTools: true,
        supportsVision: true,
        supportsDeepThought: true,
        supportsWebSearch: true,
        supportsImageGeneration: false,
        supportsVideoRecognition: true
      },
      {
        id: 'gpt-5.5',
        name: 'GPT-5.5',
        type: 'reasoning',
        isEnabled: true,
        contextWindow: 400000,
        supportsTools: true,
        supportsVision: true,
        supportsDeepThought: true,
        supportsWebSearch: true,
        supportsImageGeneration: false,
        supportsVideoRecognition: true
      },
      {
        id: 'gpt-5.5-instant',
        name: 'GPT-5.5 Instant',
        type: 'chat',
        isEnabled: true,
        contextWindow: 400000,
        supportsTools: true,
        supportsVision: true,
        supportsDeepThought: false,
        supportsWebSearch: true,
        supportsImageGeneration: false,
        supportsVideoRecognition: true
      },
      {
        id: 'gpt-image-1',
        name: 'GPT Image 1',
        type: 'image',
        isEnabled: true,
        supportsTools: false,
        supportsVision: true,
        supportsDeepThought: false,
        supportsWebSearch: false,
        supportsImageGeneration: true,
        supportsVideoRecognition: false
      }
    ]
  },
  {
    id: 'alibaba',
    name: '阿里云',
    description: '提供通义千问系列模型，支持中文优化、多模态处理与企业级应用。',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    type: 'alibaba',
    isEnabled: false,
    readonly: true,
    models: [
      {
        id: 'qwen3.7-max',
        name: 'Qwen3.7 Max',
        type: 'reasoning',
        isEnabled: true,
        contextWindow: 1000000,
        supportsTools: true,
        supportsVision: true,
        supportsDeepThought: true,
        supportsWebSearch: true,
        supportsImageGeneration: false,
        supportsVideoRecognition: true
      },
      {
        id: 'qwen3.7-plus',
        name: 'Qwen3.7 Plus',
        type: 'chat',
        isEnabled: true,
        contextWindow: 1000000,
        supportsTools: true,
        supportsVision: true,
        supportsDeepThought: true,
        supportsWebSearch: true,
        supportsImageGeneration: false,
        supportsVideoRecognition: true
      },
      {
        id: 'qwen-image',
        name: 'Qwen Image',
        type: 'image',
        isEnabled: true,
        supportsTools: false,
        supportsVision: false,
        supportsDeepThought: false,
        supportsWebSearch: false,
        supportsImageGeneration: true,
        supportsVideoRecognition: false
      }
    ]
  },
  {
    id: 'baidu',
    name: '百度智能云',
    description: '提供文心一言系列模型，深耕中文场景，支持知识增强与对话生成。',
    baseUrl: 'https://qianfan.baidubce.com/v2',
    type: 'openai',
    isEnabled: false,
    readonly: true,
    models: [
      {
        id: 'ernie-5.1',
        name: 'ERNIE 5.1',
        type: 'reasoning',
        isEnabled: true,
        contextWindow: 128000,
        supportsTools: true,
        supportsVision: true,
        supportsDeepThought: true,
        supportsWebSearch: true,
        supportsImageGeneration: false,
        supportsVideoRecognition: true
      }
    ]
  },
  {
    id: 'volcengine',
    name: '火山引擎',
    description: '提供豆包系列模型，适用于对话生成、内容创作与智能助手场景。',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    type: 'volcengine',
    isEnabled: false,
    readonly: true,
    models: [
      {
        id: 'doubao-seed-2.0-pro',
        name: 'Doubao Seed 2.0 Pro',
        type: 'reasoning',
        isEnabled: true,
        contextWindow: 256000,
        supportsTools: true,
        supportsVision: true,
        supportsDeepThought: true,
        supportsWebSearch: true,
        supportsImageGeneration: false,
        supportsVideoRecognition: true
      },
      {
        id: 'doubao-seed-2.0-code',
        name: 'Doubao Seed 2.0 Code',
        type: 'code',
        isEnabled: true,
        contextWindow: 256000,
        supportsTools: true,
        supportsVision: true,
        supportsDeepThought: true,
        supportsWebSearch: true,
        supportsImageGeneration: false,
        supportsVideoRecognition: false
      }
    ]
  },
  {
    id: 'tencentcloud',
    name: '腾讯云',
    description: '提供混元系列大模型，擅长对话、创作、代码与企业级智能服务。',
    baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
    type: 'openai',
    isEnabled: false,
    readonly: true,
    models: [
      {
        id: 'hy3-preview',
        name: 'Hy3 Preview',
        type: 'reasoning',
        isEnabled: true,
        contextWindow: 256000,
        supportsTools: true,
        supportsVision: true,
        supportsDeepThought: true,
        supportsWebSearch: true,
        supportsImageGeneration: false,
        supportsVideoRecognition: true
      }
    ]
  },
  {
    id: 'xiaomi',
    name: '小米',
    description: '提供小米 MiMo 系列大模型，支持超长上下文、原生多模态与 Agent 能力。',
    baseUrl: 'https://api.xiaomimimo.com/v1',
    type: 'openai',
    isEnabled: false,
    readonly: true,
    models: [
      {
        id: 'mimo-v2.5-pro',
        name: 'MiMo V2.5 Pro',
        type: 'reasoning',
        isEnabled: true,
        contextWindow: 1000000,
        supportsTools: true,
        supportsVision: true,
        supportsDeepThought: true,
        supportsWebSearch: true,
        supportsImageGeneration: false,
        supportsVideoRecognition: true
      }
    ]
  },
  {
    id: 'zhipu',
    name: '智谱 AI',
    description: '提供 GLM 系列模型，支持中文场景优化、对话生成与智能问答。',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    type: 'openai',
    isEnabled: false,
    readonly: true,
    models: [
      {
        id: 'glm-5.2',
        name: 'GLM-5.2',
        type: 'reasoning',
        isEnabled: true,
        contextWindow: 1000000,
        supportsTools: true,
        supportsVision: true,
        supportsDeepThought: true,
        supportsWebSearch: true,
        supportsImageGeneration: false,
        supportsVideoRecognition: true
      },
      {
        id: 'glm-4.6v',
        name: 'GLM-4.6V',
        type: 'vision',
        isEnabled: true,
        contextWindow: 128000,
        supportsTools: true,
        supportsVision: true,
        supportsDeepThought: true,
        supportsWebSearch: false,
        supportsImageGeneration: false,
        supportsVideoRecognition: true
      },
      {
        id: 'cogview-4',
        name: 'CogView 4',
        type: 'image',
        isEnabled: true,
        supportsTools: false,
        supportsVision: false,
        supportsDeepThought: false,
        supportsWebSearch: false,
        supportsImageGeneration: true,
        supportsVideoRecognition: false
      }
    ]
  }
];
