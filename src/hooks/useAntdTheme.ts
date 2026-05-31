/**
 * @file useAntdTheme.ts
 * @description Ant Design Vue 主题 Hook，从统一 Token 派生主题配置。
 */
import type { ComputedRef } from 'vue';
import { computed } from 'vue';
import theme from 'ant-design-vue/es/theme';
import { useSettingStore } from '@/stores/ui/setting';
import { getResolvedTokens, toAntdToken } from '@/theme';

const { darkAlgorithm, defaultAlgorithm } = theme;

/**
 * Ant Design 主题配置。
 */
interface AntdThemeConfig {
  algorithm: typeof darkAlgorithm | typeof defaultAlgorithm;
  token: ReturnType<typeof toAntdToken>;
}

/**
 * useAntdTheme 返回值。
 */
interface UseAntdThemeResult {
  antdTheme: ComputedRef<AntdThemeConfig>;
}

/**
 * 提供 Ant Design Vue 主题配置，从统一 Token 派生。
 * @returns 包含 antdTheme 计算属性的对象
 */
export function useAntdTheme(): UseAntdThemeResult {
  const settingStore = useSettingStore();

  const antdTheme = computed<AntdThemeConfig>(() => {
    const isDark = settingStore.resolvedTheme === 'dark';
    const tokens = getResolvedTokens(settingStore.themePreset, isDark ? 'dark' : 'light');
    return {
      algorithm: isDark ? darkAlgorithm : defaultAlgorithm,
      token: toAntdToken(tokens)
    };
  });

  return { antdTheme };
}
