/**
 * @file tokyonight.ts
 * @description Tokyonight 主题预设，基于 folke/tokyonight.nvim 官方色板。
 * 色值来源：https://github.com/folke/tokyonight.nvim
 * 亮色使用 night 风格反转色，暗色使用 storm 风格。
 */
import type { BasePalette } from '../core/factory';
import { createThemeTokens } from '../core/factory';
import { registerPreset } from '../core/registry';

/**
 * Tokyonight 亮色基础色板（day 风格，基于 night 反转）。
 * 色值来源：lua/tokyonight/colors/night.lua + Util.invert()
 */
const tokyonightDay: BasePalette = {
  bg0: '#e1e2e7',
  bg1: '#d5d7e1',
  bg2: '#c8cad8',
  bg3: '#b8baca',
  bg4: '#a9abbf',
  fg0: '#374151',
  fg1: '#6b7280',
  fg2: '#9ca3af',
  red: '#f52a65',
  green: '#587539',
  yellow: '#8c6c3e',
  blue: '#2e7de9',
  purple: '#9854f1',
  orange: '#b15c00',
  cyan: '#007197',
  syntaxComment: '#848cb5',
  syntaxKeyword: '#7847bd',
  syntaxString: '#587539',
  syntaxFunction: '#2e7de9',
  syntaxNumber: '#b15c00',
  syntaxType: '#007197',
  syntaxVariable: '#9854f1',
  syntaxOperator: '#374151',
  syntaxTag: '#587539',
  syntaxAttribute: '#2e7de9',
  accent: '#2e7de9',
  border: '#a8aecb',
  selectionBg: '#b6d0f7'
};

/**
 * Tokyonight 暗色基础色板（storm 风格）。
 * 色值来源：lua/tokyonight/colors/storm.lua
 */
const tokyonightStorm: BasePalette = {
  bg0: '#24283b',
  bg1: '#1f2335',
  bg2: '#292e42',
  bg3: '#343a55',
  bg4: '#3b4261',
  fg0: '#c0caf5',
  fg1: '#a9b1d6',
  fg2: '#565f89',
  red: '#f7768e',
  green: '#9ece6a',
  yellow: '#e0af68',
  blue: '#7aa2f7',
  purple: '#bb9af7',
  orange: '#ff9e64',
  cyan: '#7dcfff',
  syntaxComment: '#565f89',
  syntaxKeyword: '#bb9af7',
  syntaxString: '#9ece6a',
  syntaxFunction: '#7aa2f7',
  syntaxNumber: '#ff9e64',
  syntaxType: '#2ac3de',
  syntaxVariable: '#c0caf5',
  syntaxOperator: '#89ddff',
  syntaxTag: '#73daca',
  syntaxAttribute: '#7aa2f7',
  accent: '#7aa2f7',
  border: '#3b4261',
  selectionBg: '#283457'
};

registerPreset({
  id: 'tokyonight',
  label: '紫蓝色',
  light: createThemeTokens(tokyonightDay, 'light'),
  dark: createThemeTokens(tokyonightStorm, 'dark')
});
