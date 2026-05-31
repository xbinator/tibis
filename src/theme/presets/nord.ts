/**
 * @file nord.ts
 * @description Nord 主题预设，基于 arcticicestudio/nord 官方色板。
 * 色值来源：https://github.com/arcticicestudio/nord
 * Nord 原生仅提供暗色方案，亮色为基于 Nord 色板推导的变体。
 */
import type { BasePalette } from '../core/factory';
import { createThemeTokens } from '../core/factory';
import { registerPreset } from '../core/registry';

/**
 * Nord 亮色基础色板（基于 Nord 色板推导的亮色变体）。
 * 色值来源：nord 官方色板 snow/ice 系列色值反转推导
 */
const nordLight: BasePalette = {
  bg0: '#eceff4',
  bg1: '#e5e9f0',
  bg2: '#d8dee9',
  bg3: '#c8ced8',
  bg4: '#b0b8c4',
  fg0: '#2e3440',
  fg1: '#3b4252',
  fg2: '#4c566a',
  red: '#bf616a',
  green: '#a3be8c',
  yellow: '#ebcb8b',
  blue: '#5e81ac',
  purple: '#b48ead',
  orange: '#d08770',
  cyan: '#8fbcbb',
  syntaxComment: '#6b7394',
  syntaxKeyword: '#bf616a',
  syntaxString: '#a3be8c',
  syntaxFunction: '#5e81ac',
  syntaxNumber: '#d08770',
  syntaxType: '#8fbcbb',
  syntaxVariable: '#2e3440',
  syntaxOperator: '#2e3440',
  syntaxTag: '#8fbcbb',
  syntaxAttribute: '#5e81ac',
  accent: '#5e81ac',
  border: '#b0b8c4',
  selectionBg: '#d8dee9'
};

/**
 * Nord 暗色基础色板（原版 Nord）。
 * 色值来源：nord/src/nord.json — Polar Night + Snow Storm + Frost + Aurora
 */
const nordDark: BasePalette = {
  bg0: '#2e3440',
  bg1: '#242933',
  bg2: '#3b4252',
  bg3: '#434c5e',
  bg4: '#4c566a',
  fg0: '#eceff4',
  fg1: '#d8dee9',
  fg2: '#81a1c1',
  red: '#bf616a',
  green: '#a3be8c',
  yellow: '#ebcb8b',
  blue: '#81a1c1',
  purple: '#b48ead',
  orange: '#d08770',
  cyan: '#88c0d0',
  syntaxComment: '#616e88',
  syntaxKeyword: '#81a1c1',
  syntaxString: '#a3be8c',
  syntaxFunction: '#88c0d0',
  syntaxNumber: '#b48ead',
  syntaxType: '#8fbcbb',
  syntaxVariable: '#d8dee9',
  syntaxOperator: '#81a1c1',
  syntaxTag: '#8fbcbb',
  syntaxAttribute: '#8fbcbb',
  accent: '#88c0d0',
  border: '#4c566a',
  selectionBg: '#434c5e'
};

registerPreset({
  id: 'nord',
  label: '冰蓝色「Nord」',
  light: createThemeTokens(nordLight, 'light'),
  dark: createThemeTokens(nordDark, 'dark')
});
