/**
 * @file use-chat-service-config.test.ts
 * @description BChat chat service config hook 测试。
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatServiceConfig } from '@/components/BChat/hooks/useChatServiceConfig';

const getAvailableServiceConfigMock = vi.hoisted(() => vi.fn());
const getModelToolSupportMock = vi.hoisted(() => vi.fn());

vi.mock('@/stores/ai/serviceModel', () => ({
  useServiceModelStore: vi.fn(() => ({
    getAvailableServiceConfig: getAvailableServiceConfigMock
  }))
}));

vi.mock('@/ai/tools/policy', () => ({
  getModelToolSupport: getModelToolSupportMock
}));

describe('useChatServiceConfig', (): void => {
  beforeEach((): void => {
    getAvailableServiceConfigMock.mockReset();
    getModelToolSupportMock.mockReset();
  });

  it('returns undefined when chat service config is missing', async (): Promise<void> => {
    getAvailableServiceConfigMock.mockResolvedValue(undefined);
    const serviceConfig = useChatServiceConfig();

    await expect(serviceConfig.resolveServiceConfig()).resolves.toBeUndefined();

    expect(getAvailableServiceConfigMock).toHaveBeenCalledWith('chat');
    expect(getModelToolSupportMock).not.toHaveBeenCalled();
  });

  it('returns chat service config with tool support', async (): Promise<void> => {
    getAvailableServiceConfigMock.mockResolvedValue({ providerId: 'provider-1', modelId: 'model-1' });
    getModelToolSupportMock.mockResolvedValue({ supported: true });
    const serviceConfig = useChatServiceConfig();

    await expect(serviceConfig.resolveServiceConfig()).resolves.toEqual({
      providerId: 'provider-1',
      modelId: 'model-1',
      toolSupport: { supported: true }
    });

    expect(getModelToolSupportMock).toHaveBeenCalledWith('provider-1', 'model-1');
  });
});
