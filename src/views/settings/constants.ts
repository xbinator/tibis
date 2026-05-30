import type { AIProviderType } from 'types/ai';

export type SettingsMenuKey = 'provider' | 'service-model' | 'search' | 'mcp' | 'skill' | 'general' | 'speech' | 'logger';

/**
 * 侧边栏菜单项定义
 */
export interface MenuItem {
  key: SettingsMenuKey;
  label: string;
  icon: string;
  path: string;
}

/**
 * 按 key 索引的菜单项映射，方便按分组引用
 */
const menuItemMap: Record<SettingsMenuKey, MenuItem> = {
  provider: { key: 'provider', label: '模型服务', icon: 'lucide:cloud', path: '/settings/provider' },
  'service-model': { key: 'service-model', label: '默认模型', icon: 'lucide:sparkles', path: '/settings/service-model' },
  search: { key: 'search', label: '网络搜索', icon: 'lucide:globe', path: '/settings/tools/search' },
  mcp: { key: 'mcp', label: 'MCP', icon: 'lucide:cable', path: '/settings/tools/mcp' },
  skill: { key: 'skill', label: '技能', icon: 'lucide:wrench', path: '/settings/tools/skill' },
  general: { key: 'general', label: '通用', icon: 'lucide:settings-2', path: '/settings/general' },
  speech: { key: 'speech', label: '语音服务', icon: 'lucide:mic', path: '/settings/speech' },
  logger: { key: 'logger', label: '运行日志', icon: 'lucide:file-text', path: '/settings/logger' }
};

/** 平铺列表（兼容旧引用） */
export const menuItems: MenuItem[] = Object.values(menuItemMap);

/**
 * 菜单分组定义
 */
export interface MenuGroup {
  label: string;
  items: MenuItem[];
}

/**
 * 侧边栏菜单分组
 */
export const menuGroups: MenuGroup[] = [
  { label: 'AI 服务', items: ['provider', 'service-model'].map((k) => menuItemMap[k as SettingsMenuKey]) },
  { label: '功能配置', items: ['general', 'mcp', 'skill', 'search'].map((k) => menuItemMap[k as SettingsMenuKey]) },
  { label: '系统', items: ['logger'].map((k) => menuItemMap[k as SettingsMenuKey]) }
];

export interface ProviderFormatOption {
  value: AIProviderType;
  label: string;
}

export const providerFormatOptions: ProviderFormatOption[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google' },
  { value: 'deepseek', label: 'Deepseek' }
];

export const providerFormatLabels = Object.fromEntries(providerFormatOptions.map((option) => [option.value, option.label]));

export const CONTAINER_WIDTH_THRESHOLD = 800;

export const SIDEBAR_WIDTH_LARGE = 280;

export const SIDEBAR_WIDTH_SMALL = 60;
