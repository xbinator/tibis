/**
 * @file kanagawa.ts
 * @description Kanagawa 主题预设，基于 rebelot/kanagawa.nvim 官方色板。
 * 色值来源：https://github.com/rebelot/kanagawa.nvim
 */
import type { BasePalette } from '../core/factory';
import { createThemeTokens } from '../core/factory';
import { registerPreset } from '../core/registry';

/**
 * Kanagawa 亮色基础色板（lotus 变体）。
 * 色值来源：lua/kanagawa/themes/lotus.lua
 */
const kanagawaLotus: BasePalette = {
  bg0: '#f2ecbc',
  bg1: '#e8e5b5',
  bg2: '#ddd8a5',
  bg3: '#d4cca0',
  bg4: '#c9c498',
  fg0: '#545464',
  fg1: '#62576a',
  fg2: '#8a7f72',
  red: '#c54046',
  green: '#6f894e',
  yellow: '#77713f',
  blue: '#4d699b',
  purple: '#b35b79',
  orange: '#cc6d00',
  cyan: '#597b75',
  syntaxComment: '#8a7f72',
  syntaxKeyword: '#b35b79',
  syntaxString: '#6f894e',
  syntaxFunction: '#4d699b',
  syntaxNumber: '#cc6d00',
  syntaxType: '#597b75',
  syntaxVariable: '#c54046',
  syntaxOperator: '#545464',
  syntaxTag: '#597b75',
  syntaxAttribute: '#4d699b',
  accent: '#4d699b',
  border: '#c9c498',
  selectionBg: '#c9cbd1'
};

/**
 * Kanagawa 暗色基础色板（wave 变体）。
 * 色值来源：lua/kanagawa/themes/wave.lua
 */
const kanagawaWave: BasePalette = {
  bg0: '#1f1f28',
  bg1: '#16161d',
  bg2: '#2a2a37',
  bg3: '#363646',
  bg4: '#54546d',
  fg0: '#dcd7ba',
  fg1: '#c8c093',
  fg2: '#727169',
  red: '#c34043',
  green: '#76946a',
  yellow: '#c0a36e',
  blue: '#7e9cd8',
  purple: '#957fb8',
  orange: '#e06c75',
  cyan: '#6a9589',
  syntaxComment: '#727169',
  syntaxKeyword: '#e06c75',
  syntaxString: '#76946a',
  syntaxFunction: '#7e9cd8',
  syntaxNumber: '#c0a36e',
  syntaxType: '#6a9589',
  syntaxVariable: '#dcd7ba',
  syntaxOperator: '#c8c093',
  syntaxTag: '#6a9589',
  syntaxAttribute: '#7e9cd8',
  accent: '#7e9cd8',
  border: '#54546d',
  selectionBg: '#2d2f40'
};

registerPreset({
  id: 'kanagawa',
  label: '靛蓝色',
  light: createThemeTokens(kanagawaLotus, 'light'),
  dark: createThemeTokens(kanagawaWave, 'dark')
});
