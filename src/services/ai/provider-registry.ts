import type { AIProvider, AIProviderType } from './types';
import { AI_ERROR_CODE, AIError } from './errors';

export class AIProviderRegistry {
  private readonly providers = new Map<AIProviderType, AIProvider>();

  register(provider: AIProvider): void {
    this.providers.set(provider.type, provider);
  }

  get(type: AIProviderType): AIProvider {
    const provider = this.providers.get(type);

    if (!provider) {
      throw new AIError(AI_ERROR_CODE.UNSUPPORTED_PROVIDER_TYPE, `暂不支持 ${type} 类型的服务商`);
    }

    return provider;
  }

  has(type: AIProviderType): boolean {
    return this.providers.has(type);
  }
}
