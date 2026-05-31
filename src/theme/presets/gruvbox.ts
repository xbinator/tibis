/**
 * @file gruvbox.ts
 * @description Gruvbox 主题预设，基于 morhetz/gruvbox 官方色板。
 * 色值来源：https://github.com/morhetz/gruvbox
 */
import type { BasePalette } from '../core/factory';
import { createThemeTokens } from '../core/factory';
import { registerPreset } from '../core/registry';

/**
 * Gruvbox 亮色基础色板。
 * 色值来源：gruvbox/autoload/gruvbox.vim — light palette
 */
const gruvboxLight: BasePalette = {
  bg0: '#fbf1c7',
  bg1: '#ebdbb2',
  bg2: '#d5c4a1',
  bg3: '#bdae93',
  bg4: '#a89984',
  fg0: '#282828',
  fg1: '#504945',
  fg2: '#665c54',
  red: '#9d0006',
  green: '#79740e',
  yellow: '#b57614',
  blue: '#076678',
  purple: '#8f3f71',
  orange: '#af3a03',
  cyan: '#427b58',
  syntaxComment: '#928374',
  syntaxKeyword: '#9d0006',
  syntaxString: '#79740e',
  syntaxFunction: '#427b58',
  syntaxNumber: '#af3a03',
  syntaxType: '#076678',
  syntaxVariable: '#af3a03',
  syntaxOperator: '#282828',
  syntaxTag: '#427b58',
  syntaxAttribute: '#076678',
  accent: '#076678',
  border: '#bdae93',
  selectionBg: '#d5c4a1'
};

/**
 * Gruvbox 暗色基础色板。
 * 色值来源：gruvbox/autoload/gruvbox.vim — dark palette
 */
const gruvboxDark: BasePalette = {
  bg0: '#282828',
  bg1: '#1d2021',
  bg2: '#32302f',
  bg3: '#3c3836',
  bg4: '#504945',
  fg0: '#ebdbb2',
  fg1: '#a89984',
  fg2: '#665c54',
  red: '#fb4934',
  green: '#b8bb26',
  yellow: '#fabd2f',
  blue: '#83a598',
  purple: '#d3869b',
  orange: '#fe8019',
  cyan: '#8ec07c',
  syntaxComment: '#665c54',
  syntaxKeyword: '#fb4934',
  syntaxString: '#b8bb26',
  syntaxFunction: '#fabd2f',
  syntaxNumber: '#d3869b',
  syntaxType: '#8ec07c',
  syntaxVariable: '#fe8019',
  syntaxOperator: '#ebdbb2',
  syntaxTag: '#8ec07c',
  syntaxAttribute: '#83a598',
  accent: '#83a598',
  border: '#504945',
  selectionBg: '#3c3836'
};

registerPreset({
  id: 'gruvbox',
  label: 'Gruvbox',
  light: createThemeTokens(gruvboxLight, 'light'),
  dark: createThemeTokens(gruvboxDark, 'dark')
});
