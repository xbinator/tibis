/**
 * @file preset-list.test.ts
 * @description 验证主题预设注册表包含新增主题并能解析对应 Token。
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getPresetList, getResolvedTokens, toCssVars } from '@/theme';

/**
 * 已从主题选择器移除的主题预设。
 */
interface RemovedThemePreset {
  /** 主题预设 ID */
  id: string;
  /** 主题预设显示名称 */
  label: string;
}

/**
 * 用户不再需要展示的主题色名称集合。
 */
const REMOVED_THEME_PRESETS: RemovedThemePreset[] = [
  { id: 'everforest', label: '柔绿色「Everforest」' },
  { id: 'tokyonight', label: '紫蓝色「Tokyonight」' },
  { id: 'ayu', label: '暖黄色「Ayu」' },
  { id: 'catppuccin', label: '奶咖色「Catppuccin」' },
  { id: 'catppuccin-macchiato', label: '深咖色「Catppuccin」' },
  { id: 'gruvbox', label: '棕黄色「Gruvbox」' },
  { id: 'kanagawa', label: '靛蓝色「Kanagawa」' },
  { id: 'nord', label: '冰蓝色「Nord」' },
  { id: 'one-dark', label: '深灰色「One Dark」' }
];

describe('theme preset registry', (): void => {
  it('registers the Velora clear sky blue theme preset', (): void => {
    const presets = getPresetList();

    expect(presets).toContainEqual({ id: 'velora', label: '晴空蓝「Velora」' });
  });

  it('resolves Velora tokens with only the intended primary accents changed', (): void => {
    const lightTokens = getResolvedTokens('velora', 'light');
    const lightCssVars = toCssVars(lightTokens);

    expect(lightTokens.bg.primary).toBe('#ffffff');
    expect(lightTokens.bg.elevated).toBe('#ffffff');
    expect(lightTokens.color.primary).toBe('#1890ff');
    expect(lightTokens.richEditor.link).toBe('#1890ff');
    expect(lightTokens.color.success).toBe('#10b981');
    expect(lightTokens.color.warning).toBe('#f59e0b');
    expect(lightTokens.code.keyword).toBe('#dc3545');
    expect(lightTokens.sourceEditor.markdownLink).toBe('#0a5a40');
    expect(lightCssVars['--color-primary']).toBe('#1890ff');
    expect(lightCssVars['--bg-primary']).toBe('#ffffff');
  });

  it('defines Velora with explicit tokens like the default preset', (): void => {
    const sourceUrl = new URL('../../src/theme/presets/velora.ts', import.meta.url);

    expect(existsSync(sourceUrl)).toBe(true);

    const source = readFileSync(sourceUrl, 'utf8');

    expect(source).toContain('import type { ThemeTokens }');
    expect(source).toContain('const veloraLight: ThemeTokens');
    expect(source).not.toContain('createThemeTokens');
  });

  it('omits removed color theme presets from the public preset list', (): void => {
    const presets = getPresetList();

    for (const preset of REMOVED_THEME_PRESETS) {
      expect(presets).not.toContainEqual(preset);
    }
  });

  it('registers the high-contrast Shonen theme preset', (): void => {
    const presets = getPresetList();

    expect(presets).toContainEqual({ id: 'shonen', label: '热血红黑「Shonen」' });
  });

  it('resolves Shonen light and dark tokens for manga paper and red-black modes', (): void => {
    const lightTokens = getResolvedTokens('shonen', 'light');
    const darkTokens = getResolvedTokens('shonen', 'dark');
    const darkCssVars = toCssVars(darkTokens);

    expect(lightTokens.bg.primary).toBe('#fff8e7');
    expect(lightTokens.text.primary).toBe('#111111');
    expect(lightTokens.color.primary).toBe('#e60012');
    expect(darkTokens.bg.primary).toBe('#07070a');
    expect(darkTokens.text.primary).toBe('#fff3e0');
    expect(darkTokens.color.primary).toBe('#ff1f3d');
    expect(darkCssVars['--color-primary']).toBe('#ff1f3d');
  });

  it('registers the monochrome Manga Ink theme preset', (): void => {
    const presets = getPresetList();

    expect(presets).toContainEqual({ id: 'manga-ink', label: '黑白线稿「Manga Ink」' });
  });

  it('resolves Manga Ink light and dark tokens for ink paper and inverse ink modes', (): void => {
    const lightTokens = getResolvedTokens('manga-ink', 'light');
    const darkTokens = getResolvedTokens('manga-ink', 'dark');
    const lightCssVars = toCssVars(lightTokens);

    expect(lightTokens.bg.primary).toBe('#fffdf5');
    expect(lightTokens.text.primary).toBe('#050505');
    expect(lightTokens.color.primary).toBe('#050505');
    expect(darkTokens.bg.primary).toBe('#050505');
    expect(darkTokens.text.primary).toBe('#f8f8f2');
    expect(darkTokens.color.primary).toBe('#f8f8f2');
    expect(lightCssVars['--border-primary']).toBe('#050505');
  });
});
