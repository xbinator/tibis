import type { ModelServiceConfig, ModeServicelConfigMap, ModelServiceType } from 'types/model';
import { cloneDeep } from 'lodash-es';
import { dbSelect, dbExecute } from '../utils';

const SELECT_ALL_CONFIGS_SQL = 'SELECT service_type, provider_id, model_id, custom_prompt, updated_at FROM service_models';
const SELECT_ONE_CONFIG_SQL = `${SELECT_ALL_CONFIGS_SQL} WHERE service_type = ? LIMIT 1`;
const UPSERT_CONFIG_SQL = `
  INSERT OR REPLACE INTO service_models
    (service_type, provider_id, model_id, custom_prompt, updated_at)
  VALUES (?, ?, ?, ?, ?)
`;
const DELETE_CONFIG_SQL = 'DELETE FROM service_models WHERE service_type = ?';

interface ServiceModelRow {
  service_type: string;
  provider_id: string | null;
  model_id: string | null;
  custom_prompt: string | null;
  updated_at: number;
}

function mapRowToConfig(row: ServiceModelRow): ModelServiceConfig {
  return {
    providerId: row.provider_id ?? undefined,
    modelId: row.model_id ?? undefined,
    customPrompt: row.custom_prompt ?? undefined,
    updatedAt: row.updated_at
  };
}

export const serviceModelsStorage = {
  async getAllConfigs(): Promise<ModeServicelConfigMap> {
    const rows = await dbSelect<ServiceModelRow>(SELECT_ALL_CONFIGS_SQL);
    return cloneDeep(
      rows.reduce<ModeServicelConfigMap>((configs, row) => {
        configs[row.service_type as ModelServiceType] = mapRowToConfig(row);
        return configs;
      }, {})
    );
  },

  async getConfig(serviceType: ModelServiceType): Promise<ModelServiceConfig | null> {
    const rows = await dbSelect<ServiceModelRow>(SELECT_ONE_CONFIG_SQL, [serviceType]);
    if (!rows[0]) return null;

    return cloneDeep(mapRowToConfig(rows[0]));
  },

  async saveConfig(serviceType: ModelServiceType, config: Omit<ModelServiceConfig, 'updatedAt'>): Promise<ModelServiceConfig> {
    const nextConfig: ModelServiceConfig = { ...config, updatedAt: Date.now() };

    await dbExecute(UPSERT_CONFIG_SQL, [
      serviceType,
      nextConfig.providerId ?? null,
      nextConfig.modelId ?? null,
      nextConfig.customPrompt ?? null,
      nextConfig.updatedAt
    ]);

    return cloneDeep(nextConfig);
  },

  async removeConfig(serviceType: ModelServiceType): Promise<void> {
    await dbExecute(DELETE_CONFIG_SQL, [serviceType]);
  }
};
