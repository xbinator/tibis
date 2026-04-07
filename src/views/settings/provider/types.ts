import type { Provider, ProviderModel } from '@/utils/storage';

export type { Provider };
export type Model = ProviderModel;

export interface ModelSubmitResult {
  success: boolean;
  message?: string;
}
