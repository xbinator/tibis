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
        id: 'claude-opus-4-7',
        name: 'Claude Opus 4.7',
        type: 'reasoning',
        isEnabled: true,
        contextWindow: 200000,
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
        contextWindow: 200000,
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
        contextWindow: 200000,
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
        contextWindow: 128000,
        supportsTools: true,
        supportsVision: false,
        supportsDeepThought: true,
        supportsWebSearch: false,
        supportsImageGeneration: false,
        supportsVideoRecognition: false
      },
      {
        id: 'deepseek-v4-flash',
        name: 'DeepSeek V4 Flash',
        type: 'reasoning',
        isEnabled: true,
        contextWindow: 128000,
        supportsTools: true,
        supportsVision: false,
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
        id: 'gemini-3.1-pro-preview',
        name: 'Gemini 3.1 Pro Preview',
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
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
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
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
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
    description: '提供 MiniMax 系列模型，支持长上下文、多模态与角色扮演。',
    baseUrl: 'https://api.minimaxi.com/anthropic/v1',
    type: 'anthropic',
    isEnabled: false,
    readonly: true,
    models: [
      {
        id: 'MiniMax-M2.7',
        name: 'MiniMax M2.7',
        type: 'reasoning',
        isEnabled: true,
        contextWindow: 200000,
        supportsTools: true,
        supportsVision: false,
        supportsDeepThought: true,
        supportsWebSearch: false,
        supportsImageGeneration: false,
        supportsVideoRecognition: false
      },
      {
        id: 'MiniMax-M2.7-highspeed',
        name: 'MiniMax M2.7 Highspeed',
        type: 'chat',
        isEnabled: true,
        contextWindow: 200000,
        supportsTools: true,
        supportsVision: false,
        supportsDeepThought: true,
        supportsWebSearch: false,
        supportsImageGeneration: false,
        supportsVideoRecognition: false
      },
      {
        id: 'MiniMax-M2.5',
        name: 'MiniMax M2.5',
        type: 'code',
        isEnabled: true,
        contextWindow: 200000,
        supportsTools: true,
        supportsVision: false,
        supportsDeepThought: true,
        supportsWebSearch: false,
        supportsImageGeneration: false,
        supportsVideoRecognition: false
      }
    ]
  },
  {
    id: 'moonshot',
    name: 'Moonshot',
    description: '提供 Kimi 系列大模型，擅长长上下文处理、文档阅读和知识问答。',
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
        supportsWebSearch: false,
        supportsImageGeneration: false,
        supportsVideoRecognition: false
      },
      {
        id: 'kimi-k2.5',
        name: 'Kimi K2.5',
        type: 'reasoning',
        isEnabled: true,
        contextWindow: 256000,
        supportsTools: true,
        supportsVision: true,
        supportsDeepThought: true,
        supportsWebSearch: false,
        supportsImageGeneration: false,
        supportsVideoRecognition: false
      },
      {
        id: 'kimi-k2-thinking',
        name: 'Kimi K2 Thinking',
        type: 'reasoning',
        isEnabled: true,
        contextWindow: 256000,
        supportsTools: true,
        supportsVision: false,
        supportsDeepThought: true,
        supportsWebSearch: false,
        supportsImageGeneration: false,
        supportsVideoRecognition: false
      },
      {
        id: 'moonshot-v1-8k',
        name: 'Moonshot v1 8K',
        type: 'chat',
        isEnabled: true,
        contextWindow: 8192,
        supportsTools: true,
        supportsVision: false,
        supportsDeepThought: false,
        supportsWebSearch: false,
        supportsImageGeneration: false,
        supportsVideoRecognition: false
      },
      {
        id: 'moonshot-v1-32k',
        name: 'Moonshot v1 32K',
        type: 'chat',
        isEnabled: true,
        contextWindow: 32768,
        supportsTools: true,
        supportsVision: false,
        supportsDeepThought: false,
        supportsWebSearch: false,
        supportsImageGeneration: false,
        supportsVideoRecognition: false
      },
      {
        id: 'moonshot-v1-128k',
        name: 'Moonshot v1 128K',
        type: 'chat',
        isEnabled: true,
        contextWindow: 131072,
        supportsTools: true,
        supportsVision: false,
        supportsDeepThought: false,
        supportsWebSearch: false,
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
        id: 'gpt-5.4',
        name: 'GPT-5.4',
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
        id: 'gpt-5.4-mini',
        name: 'GPT-5.4 Mini',
        type: 'chat',
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
        id: 'gpt-5.4-nano',
        name: 'GPT-5.4 Nano',
        type: 'chat',
        isEnabled: true,
        contextWindow: 400000,
        supportsTools: true,
        supportsVision: true,
        supportsDeepThought: true,
        supportsWebSearch: true,
        supportsImageGeneration: false,
        supportsVideoRecognition: false
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
    type: 'openai',
    isEnabled: false,
    readonly: true,
    models: [
      {
        id: 'qwen3-max',
        name: 'Qwen3 Max',
        type: 'reasoning',
        isEnabled: true,
        contextWindow: 262144,
        supportsTools: true,
        supportsVision: false,
        supportsDeepThought: true,
        supportsWebSearch: true,
        supportsImageGeneration: false,
        supportsVideoRecognition: false
      },
      {
        id: 'qwen3.5-plus',
        name: 'Qwen3.5 Plus',
        type: 'chat',
        isEnabled: true,
        contextWindow: 262144,
        supportsTools: true,
        supportsVision: false,
        supportsDeepThought: true,
        supportsWebSearch: true,
        supportsImageGeneration: false,
        supportsVideoRecognition: false
      },
      {
        id: 'qwen3.5-flash',
        name: 'Qwen3.5 Flash',
        type: 'chat',
        isEnabled: true,
        contextWindow: 262144,
        supportsTools: true,
        supportsVision: false,
        supportsDeepThought: true,
        supportsWebSearch: true,
        supportsImageGeneration: false,
        supportsVideoRecognition: false
      },
      {
        id: 'qwen3-coder-plus',
        name: 'Qwen3 Coder Plus',
        type: 'code',
        isEnabled: true,
        contextWindow: 262144,
        supportsTools: true,
        supportsVision: false,
        supportsDeepThought: true,
        supportsWebSearch: false,
        supportsImageGeneration: false,
        supportsVideoRecognition: false
      },
      {
        id: 'qwen-vl-plus',
        name: 'Qwen VL Plus',
        type: 'vision',
        isEnabled: true,
        contextWindow: 128000,
        supportsTools: true,
        supportsVision: true,
        supportsDeepThought: false,
        supportsWebSearch: false,
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
    id: 'alibaba_plan',
    name: '阿里云 Plan',
    description: '提供通义千问系列模型，支持中文优化、多模态处理与企业级应用。',
    baseUrl: 'https://coding.dashscope.aliyuncs.com/v1',
    type: 'openai',
    isEnabled: false,
    readonly: true,
    models: [
      {
        id: 'qwen3-max',
        name: 'Qwen3 Max',
        type: 'reasoning',
        isEnabled: true,
        contextWindow: 262144,
        supportsTools: true,
        supportsVision: false,
        supportsDeepThought: true,
        supportsWebSearch: true,
        supportsImageGeneration: false,
        supportsVideoRecognition: false
      },
      {
        id: 'qwen3-coder-plus',
        name: 'Qwen3 Coder Plus',
        type: 'code',
        isEnabled: true,
        contextWindow: 262144,
        supportsTools: true,
        supportsVision: false,
        supportsDeepThought: true,
        supportsWebSearch: false,
        supportsImageGeneration: false,
        supportsVideoRecognition: false
      }
    ]
  },
  {
    id: 'baidu',
    name: '百度',
    description: '提供文心一言系列模型，深耕中文场景，支持知识增强与对话生成。',
    baseUrl: 'https://qianfan.baidubce.com/v2',
    type: 'openai',
    isEnabled: false,
    readonly: true,
    models: [
      {
        id: 'ernie-5.0-thinking-latest',
        name: 'ERNIE 5.0 Thinking Latest',
        type: 'reasoning',
        isEnabled: true,
        contextWindow: 128000,
        supportsTools: true,
        supportsVision: true,
        supportsDeepThought: true,
        supportsWebSearch: true,
        supportsImageGeneration: false,
        supportsVideoRecognition: true
      },
      {
        id: 'ernie-5.0',
        name: 'ERNIE 5.0',
        type: 'chat',
        isEnabled: true,
        contextWindow: 128000,
        supportsTools: true,
        supportsVision: true,
        supportsDeepThought: false,
        supportsWebSearch: true,
        supportsImageGeneration: false,
        supportsVideoRecognition: true
      },
      {
        id: 'ernie-4.5-turbo-128k',
        name: 'ERNIE 4.5 Turbo 128K',
        type: 'chat',
        isEnabled: true,
        contextWindow: 128000,
        supportsTools: true,
        supportsVision: false,
        supportsDeepThought: false,
        supportsWebSearch: true,
        supportsImageGeneration: false,
        supportsVideoRecognition: false
      },
      {
        id: 'ernie-4.5-turbo-vl',
        name: 'ERNIE 4.5 Turbo VL',
        type: 'vision',
        isEnabled: true,
        contextWindow: 32000,
        supportsTools: true,
        supportsVision: true,
        supportsDeepThought: false,
        supportsWebSearch: true,
        supportsImageGeneration: false,
        supportsVideoRecognition: true
      }
    ]
  },
  {
    id: 'baidu_plan',
    name: '百度 Plan',
    description: '提供文心一言系列模型，深耕中文场景，支持知识增强与对话生成。',
    baseUrl: 'https://qianfan.baidubce.com/v2/coding',
    type: 'openai',
    isEnabled: false,
    readonly: true,
    models: [
      {
        id: 'ernie-5.0-thinking-latest',
        name: 'ERNIE 5.0 Thinking Latest',
        type: 'reasoning',
        isEnabled: true,
        contextWindow: 128000,
        supportsTools: true,
        supportsVision: true,
        supportsDeepThought: true,
        supportsWebSearch: true,
        supportsImageGeneration: false,
        supportsVideoRecognition: true
      },
      {
        id: 'ernie-4.5-turbo-128k',
        name: 'ERNIE 4.5 Turbo 128K',
        type: 'chat',
        isEnabled: true,
        contextWindow: 128000,
        supportsTools: true,
        supportsVision: false,
        supportsDeepThought: false,
        supportsWebSearch: true,
        supportsImageGeneration: false,
        supportsVideoRecognition: false
      }
    ]
  },
  {
    id: 'volcengine',
    name: '火山引擎',
    description: '提供豆包系列模型，适用于对话生成、内容创作与智能助手场景。',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    type: 'openai',
    isEnabled: false,
    readonly: true,
    models: [
      {
        id: 'doubao-seed-1-8-251228',
        name: 'Doubao Seed 1.8',
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
        id: 'doubao-seed-1-6-250615',
        name: 'Doubao Seed 1.6',
        type: 'chat',
        isEnabled: true,
        contextWindow: 256000,
        supportsTools: true,
        supportsVision: false,
        supportsDeepThought: true,
        supportsWebSearch: true,
        supportsImageGeneration: false,
        supportsVideoRecognition: false
      },
      {
        id: 'doubao-seed-1-6-flash-250828',
        name: 'Doubao Seed 1.6 Flash',
        type: 'chat',
        isEnabled: true,
        contextWindow: 256000,
        supportsTools: true,
        supportsVision: false,
        supportsDeepThought: false,
        supportsWebSearch: true,
        supportsImageGeneration: false,
        supportsVideoRecognition: false
      },
      {
        id: 'doubao-seed-1-6-vision-250815',
        name: 'Doubao Seed 1.6 Vision',
        type: 'vision',
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
    id: 'volcengine_plan',
    name: '火山引擎 Plan',
    description: '提供豆包系列模型，适用于对话生成、内容创作与智能助手场景。',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/coding',
    type: 'anthropic',
    isEnabled: false,
    readonly: true,
    models: [
      {
        id: 'doubao-seed-code-preview-251028',
        name: 'Doubao Seed Code Preview',
        type: 'code',
        isEnabled: true,
        contextWindow: 256000,
        supportsTools: true,
        supportsVision: false,
        supportsDeepThought: true,
        supportsWebSearch: true,
        supportsImageGeneration: false,
        supportsVideoRecognition: false
      },
      {
        id: 'doubao-seed-1-8-251228',
        name: 'Doubao Seed 1.8',
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
    id: 'tencentcloud',
    name: '腾讯云',
    description: '提供混元系列大模型，擅长对话、创作、代码与企业级智能服务。',
    baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
    type: 'openai',
    isEnabled: false,
    readonly: true,
    models: [
      {
        id: 'hunyuan-turbos-latest',
        name: 'Hunyuan TurboS Latest',
        type: 'chat',
        isEnabled: true,
        contextWindow: 128000,
        supportsTools: true,
        supportsVision: false,
        supportsDeepThought: false,
        supportsWebSearch: true,
        supportsImageGeneration: false,
        supportsVideoRecognition: false
      },
      {
        id: 'hunyuan-t1-latest',
        name: 'Hunyuan T1 Latest',
        type: 'reasoning',
        isEnabled: true,
        contextWindow: 128000,
        supportsTools: true,
        supportsVision: false,
        supportsDeepThought: true,
        supportsWebSearch: true,
        supportsImageGeneration: false,
        supportsVideoRecognition: false
      },
      {
        id: 'hunyuan-a13b',
        name: 'Hunyuan A13B',
        type: 'reasoning',
        isEnabled: true,
        contextWindow: 128000,
        supportsTools: true,
        supportsVision: false,
        supportsDeepThought: true,
        supportsWebSearch: true,
        supportsImageGeneration: false,
        supportsVideoRecognition: false
      },
      {
        id: 'hunyuan-lite',
        name: 'Hunyuan Lite',
        type: 'chat',
        isEnabled: true,
        contextWindow: 256000,
        supportsTools: true,
        supportsVision: false,
        supportsDeepThought: false,
        supportsWebSearch: false,
        supportsImageGeneration: false,
        supportsVideoRecognition: false
      }
    ]
  },
  {
    id: 'tencentcloud_plan',
    name: '腾讯云 Plan',
    description: '提供混元系列大模型，擅长对话、创作、代码与企业级智能服务。',
    baseUrl: 'https://api.lkeap.cloud.tencent.com/coding/v3',
    type: 'openai',
    isEnabled: false,
    readonly: true,
    models: [
      {
        id: 'hunyuan-turbos-latest',
        name: 'Hunyuan TurboS Latest',
        type: 'chat',
        isEnabled: true,
        contextWindow: 128000,
        supportsTools: true,
        supportsVision: false,
        supportsDeepThought: false,
        supportsWebSearch: true,
        supportsImageGeneration: false,
        supportsVideoRecognition: false
      },
      {
        id: 'hunyuan-t1-latest',
        name: 'Hunyuan T1 Latest',
        type: 'reasoning',
        isEnabled: true,
        contextWindow: 128000,
        supportsTools: true,
        supportsVision: false,
        supportsDeepThought: true,
        supportsWebSearch: true,
        supportsImageGeneration: false,
        supportsVideoRecognition: false
      }
    ]
  },
  {
    id: 'xiaomi',
    name: '小米',
    description: '提供小米大模型，支持智能助手与多场景应用。',
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
        contextWindow: 256000,
        supportsTools: true,
        supportsVision: true,
        supportsDeepThought: true,
        supportsWebSearch: false,
        supportsImageGeneration: false,
        supportsVideoRecognition: true
      },
      {
        id: 'mimo-v2.5',
        name: 'MiMo V2.5',
        type: 'vision',
        isEnabled: true,
        contextWindow: 256000,
        supportsTools: true,
        supportsVision: true,
        supportsDeepThought: true,
        supportsWebSearch: false,
        supportsImageGeneration: false,
        supportsVideoRecognition: true
      },
      {
        id: 'mimo-v2-flash',
        name: 'MiMo V2 Flash',
        type: 'chat',
        isEnabled: true,
        contextWindow: 128000,
        supportsTools: true,
        supportsVision: true,
        supportsDeepThought: false,
        supportsWebSearch: false,
        supportsImageGeneration: false,
        supportsVideoRecognition: true
      }
    ]
  },
  {
    id: 'xiaomi_plan',
    name: '小米 Plan',
    description: '提供小米大模型，支持智能助手与多场景应用。',
    baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
    type: 'openai',
    isEnabled: false,
    readonly: true,
    models: [
      {
        id: 'mimo-v2.5-pro',
        name: 'MiMo V2.5 Pro',
        type: 'reasoning',
        isEnabled: true,
        contextWindow: 256000,
        supportsTools: true,
        supportsVision: true,
        supportsDeepThought: true,
        supportsWebSearch: false,
        supportsImageGeneration: false,
        supportsVideoRecognition: true
      },
      {
        id: 'mimo-v2-flash',
        name: 'MiMo V2 Flash',
        type: 'chat',
        isEnabled: true,
        contextWindow: 128000,
        supportsTools: true,
        supportsVision: true,
        supportsDeepThought: false,
        supportsWebSearch: false,
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
        id: 'glm-5.1',
        name: 'GLM-5.1',
        type: 'reasoning',
        isEnabled: true,
        contextWindow: 128000,
        supportsTools: true,
        supportsVision: false,
        supportsDeepThought: true,
        supportsWebSearch: true,
        supportsImageGeneration: false,
        supportsVideoRecognition: false
      },
      {
        id: 'glm-5',
        name: 'GLM-5',
        type: 'reasoning',
        isEnabled: true,
        contextWindow: 128000,
        supportsTools: true,
        supportsVision: false,
        supportsDeepThought: true,
        supportsWebSearch: true,
        supportsImageGeneration: false,
        supportsVideoRecognition: false
      },
      {
        id: 'glm-5-turbo',
        name: 'GLM-5 Turbo',
        type: 'chat',
        isEnabled: true,
        contextWindow: 128000,
        supportsTools: true,
        supportsVision: false,
        supportsDeepThought: true,
        supportsWebSearch: true,
        supportsImageGeneration: false,
        supportsVideoRecognition: false
      },
      {
        id: 'glm-4.6v',
        name: 'GLM-4.6V',
        type: 'vision',
        isEnabled: true,
        contextWindow: 64000,
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
  },
  {
    id: 'zhipu_plan',
    name: '智谱 AI Plan',
    description: '提供 GLM 系列模型，支持中文场景优化、对话生成与智能问答。',
    baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4',
    type: 'openai',
    isEnabled: false,
    readonly: true,
    models: [
      {
        id: 'glm-5.1',
        name: 'GLM-5.1',
        type: 'reasoning',
        isEnabled: true,
        contextWindow: 128000,
        supportsTools: true,
        supportsVision: false,
        supportsDeepThought: true,
        supportsWebSearch: true,
        supportsImageGeneration: false,
        supportsVideoRecognition: false
      },
      {
        id: 'glm-5-turbo',
        name: 'GLM-5 Turbo',
        type: 'chat',
        isEnabled: true,
        contextWindow: 128000,
        supportsTools: true,
        supportsVision: false,
        supportsDeepThought: true,
        supportsWebSearch: true,
        supportsImageGeneration: false,
        supportsVideoRecognition: false
      }
    ]
  }
];
