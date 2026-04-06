export interface StoredFile {
  id: string;
  path: string | null;
  content: string;
  name: string;
  ext: string;
}

export interface ProviderModel {
  id: string;
  name: string;
  description: string;
  tags?: string[];
  isEnabled: boolean;
}

export interface Provider {
  id: string;
  name: string;
  description: string;
  type: 'openai' | 'anthropic' | 'google';
  isEnabled: boolean;
  apiKey?: string;
  baseUrl?: string;
  readonly?: boolean;
  models?: ProviderModel[];
}

export interface StoredProviderSettings {
  isEnabled?: boolean;
  apiKey?: string;
  baseUrl?: string;
  models?: ProviderModel[];
}

export interface SettingsState {
  providers: Record<string, StoredProviderSettings>;
}
