/**
 * @file catppuccin.ts
 * @description Catppuccin 主题预设，基于 catppuccin/catppuccin 官方色板。
 * 色值来源：https://github.com/catppuccin/catppuccin
 * 亮色使用 Latte 变体，暗色使用 Macchiato 变体。
 * 同时注册 catppuccin-macchiato 作为纯暗色预设。
 */
import type { BasePalette } from '../core/factory';
import { createThemeTokens } from '../core/factory';
import { registerPreset } from '../core/registry';

/**
 * Catppuccin Latte 亮色基础色板。
 * 色值来源：catppuccin/packages/catppuccin/latte.json
 */
const catppuccinLatte: BasePalette = {
  bg0: '#eff1f5',
  bg1: '#e6e9ef',
  bg2: '#dce0e8',
  bg3: '#ccd0da',
  bg4: '#bcc0cc',
  fg0: '#4c4f69',
  fg1: '#5c5f77',
  fg2: '#7c7f93',
  red: '#d20f39',
  green: '#40a02b',
  yellow: '#df8e1d',
  blue: '#1e66f5',
  purple: '#8839ef',
  orange: '#fe640b',
  cyan: '#179299',
  syntaxComment: '#7c7f93',
  syntaxKeyword: '#8839ef',
  syntaxString: '#40a02b',
  syntaxFunction: '#1e66f5',
  syntaxNumber: '#fe640b',
  syntaxType: '#179299',
  syntaxVariable: '#4c4f69',
  syntaxOperator: '#04a5e5',
  syntaxTag: '#1e66f5',
  syntaxAttribute: '#df8e1d',
  accent: '#1e66f5',
  border: '#bcc0cc',
  selectionBg: '#ccd0da'
};

/**
 * Catppuccin Mocha 暗色基础色板。
 * 色值来源：catppuccin/packages/catppuccin/mocha.json
 */
const catppuccinMocha: BasePalette = {
  bg0: '#1e1e2e',
  bg1: '#181825',
  bg2: '#252536',
  bg3: '#313244',
  bg4: '#45475a',
  fg0: '#cdd6f4',
  fg1: '#bac2de',
  fg2: '#6c7086',
  red: '#f38ba8',
  green: '#a6e3a1',
  yellow: '#f9e2af',
  blue: '#89b4fa',
  purple: '#cba6f7',
  orange: '#fab387',
  cyan: '#94e2d5',
  syntaxComment: '#6c7086',
  syntaxKeyword: '#cba6f7',
  syntaxString: '#a6e3a1',
  syntaxFunction: '#89b4fa',
  syntaxNumber: '#fab387',
  syntaxType: '#94e2d5',
  syntaxVariable: '#cdd6f4',
  syntaxOperator: '#89dceb',
  syntaxTag: '#89b4fa',
  syntaxAttribute: '#f9e2af',
  accent: '#89b4fa',
  border: '#45475a',
  selectionBg: '#313244'
};

/**
 * Catppuccin Macchiato 暗色基础色板。
 * 色值来源：catppuccin/packages/catppuccin/macchiato.json
 */
const catppuccinMacchiato: BasePalette = {
  bg0: '#24273a',
  bg1: '#1e2030',
  bg2: '#2a2d3e',
  bg3: '#363a4f',
  bg4: '#494d64',
  fg0: '#cad3f5',
  fg1: '#b8c0e0',
  fg2: '#6e738d',
  red: '#ed8796',
  green: '#a6da95',
  yellow: '#eed49f',
  blue: '#8aadf4',
  purple: '#c6a0f6',
  orange: '#f5a97f',
  cyan: '#8bd5ca',
  syntaxComment: '#6e738d',
  syntaxKeyword: '#c6a0f6',
  syntaxString: '#a6da95',
  syntaxFunction: '#8aadf4',
  syntaxNumber: '#f5a97f',
  syntaxType: '#8bd5ca',
  syntaxVariable: '#cad3f5',
  syntaxOperator: '#91d7e3',
  syntaxTag: '#8aadf4',
  syntaxAttribute: '#eed49f',
  accent: '#8aadf4',
  border: '#494d64',
  selectionBg: '#363a4f'
};

registerPreset({
  id: 'catppuccin',
  label: '奶咖色',
  light: createThemeTokens(catppuccinLatte, 'light'),
  dark: createThemeTokens(catppuccinMocha, 'dark')
});

registerPreset({
  id: 'catppuccin-macchiato',
  label: '深咖色',
  light: createThemeTokens(catppuccinLatte, 'light'),
  dark: createThemeTokens(catppuccinMacchiato, 'dark')
});
