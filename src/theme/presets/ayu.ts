/**
 * @file ayu.ts
 * @description Ayu 主题预设，基于 dempfi/ayu 主题官方色板。
 * 色值来源：https://github.com/ayu-theme/ayu-colors
 */
import type { BasePalette } from '../core/factory';
import { createThemeTokens } from '../core/factory';
import { registerPreset } from '../core/registry';

/**
 * Ayu 亮色基础色板。
 * 色值来源：ayu-colors/ayu-light.json
 */
const ayuLight: BasePalette = {
  bg0: '#fafafa',
  bg1: '#f3f3f3',
  bg2: '#ececec',
  bg3: '#e8e8e8',
  bg4: '#e2e2e2',
  fg0: '#5c6773',
  fg1: '#828c99',
  fg2: '#a6aeb8',
  red: '#ff3333',
  green: '#86b300',
  yellow: '#f29718',
  blue: '#41a6d9',
  purple: '#f07171',
  orange: '#ff6a00',
  cyan: '#4dbf99',
  syntaxComment: '#abb0b6',
  syntaxKeyword: '#ff6a00',
  syntaxString: '#86b300',
  syntaxFunction: '#41a6d9',
  syntaxNumber: '#f29718',
  syntaxType: '#4dbf99',
  syntaxVariable: '#5c6773',
  syntaxOperator: '#5c6773',
  syntaxTag: '#4dbf99',
  syntaxAttribute: '#f29718',
  accent: '#ff6a00',
  border: '#e2e2e2',
  selectionBg: '#d2d5db'
};

/**
 * Ayu 暗色基础色板（dark 变体）。
 * 色值来源：ayu-colors/ayu-dark.json
 */
const ayuDark: BasePalette = {
  bg0: '#0a0e14',
  bg1: '#0d1017',
  bg2: '#11151c',
  bg3: '#151a23',
  bg4: '#1a1f2b',
  fg0: '#b3b1ad',
  fg1: '#626a73',
  fg2: '#4a5561',
  red: '#f07178',
  green: '#c2d94c',
  yellow: '#ffb454',
  blue: '#59c2ff',
  purple: '#d2a6ff',
  orange: '#ff8f40',
  cyan: '#95e6cb',
  syntaxComment: '#626a73',
  syntaxKeyword: '#ff8f40',
  syntaxString: '#c2d94c',
  syntaxFunction: '#ffb454',
  syntaxNumber: '#e6b450',
  syntaxType: '#59c2ff',
  syntaxVariable: '#b3b1ad',
  syntaxOperator: '#f29668',
  syntaxTag: '#39bae6',
  syntaxAttribute: '#ffb454',
  accent: '#ff8f40',
  border: '#1a1f2b',
  selectionBg: '#1a3a52'
};

registerPreset({
  id: 'ayu',
  label: '暖黄色',
  light: createThemeTokens(ayuLight, 'light'),
  dark: createThemeTokens(ayuDark, 'dark')
});
