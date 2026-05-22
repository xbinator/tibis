/**
 * @file fileScoring.test.ts
 * @description 文件评分算法单元测试
 */
import { describe, expect, test } from 'vitest';
import { scoreFile, filterAndSortFiles } from '@/components/BPromptEditor/utils/fileScoring';
import type { FileMentionOption } from '@/components/BPromptEditor/types';

describe('scoreFile', () => {
  const createFile = (name: string, path: string | null = null): FileMentionOption => ({
    id: name,
    name,
    path,
    ext: name.split('.').pop() ?? ''
  });

  test('returns 0 for no match', () => {
    const file = createFile('test.ts');
    expect(scoreFile(file, 'abc')).toBe(0);
  });

  test('exact name match (case-sensitive) gets highest score', () => {
    const file = createFile('App.vue');
    expect(scoreFile(file, 'App.vue')).toBe(200);
  });

  test('name prefix match (case-sensitive) gets high score', () => {
    const file = createFile('Application.vue');
    expect(scoreFile(file, 'App')).toBe(160);
  });

  test('case-insensitive exact match gets lower score than case-sensitive', () => {
    const file = createFile('App.vue');
    expect(scoreFile(file, 'app.vue')).toBe(120);
    expect(scoreFile(file, 'App.vue')).toBe(200);
  });

  test('case-insensitive prefix match', () => {
    const file = createFile('Application.vue');
    expect(scoreFile(file, 'app')).toBe(100);
  });

  test('name contains query gets lower score', () => {
    const file = createFile('MyAppComponent.vue');
    expect(scoreFile(file, 'App')).toBe(70);
  });

  test('path exact match adds bonus', () => {
    const file = createFile('App.vue', 'src/components/App.vue');
    expect(scoreFile(file, 'src/components/App.vue')).toBe(60);
  });

  test('path prefix match adds bonus', () => {
    const file = createFile('App.vue', 'src/components/App.vue');
    expect(scoreFile(file, 'src/components')).toBe(40);
  });

  test('combines name and path scores', () => {
    const file = createFile('App.vue', 'src/App.vue');
    // name exact: 200 + path contains: 10 = 210
    expect(scoreFile(file, 'App.vue')).toBe(210);
  });

  test('path with null value still works', () => {
    const file = createFile('App.vue', null);
    expect(scoreFile(file, 'App')).toBe(160);
  });
});

describe('filterAndSortFiles', () => {
  const createFile = (name: string, path: string | null = null): FileMentionOption => ({
    id: name,
    name,
    path,
    ext: name.split('.').pop() ?? ''
  });

  test('returns all files when query is empty', () => {
    const files = [createFile('a.ts'), createFile('b.ts'), createFile('c.ts')];
    const result = filterAndSortFiles(files, '');
    expect(result).toHaveLength(3);
  });

  test('filters files by name', () => {
    const files = [createFile('App.vue'), createFile('main.ts'), createFile('utils.js')];
    const result = filterAndSortFiles(files, 'App');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('App.vue');
  });

  test('filters files by path', () => {
    const files = [createFile('App.vue', 'src/App.vue'), createFile('main.ts', 'test/main.ts')];
    const result = filterAndSortFiles(files, 'src');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('App.vue');
  });

  test('sorts by score descending', () => {
    const files = [
      createFile('MyApp.vue'),      // contains 'App' = 70
      createFile('App.vue'),        // exact match = 200
      createFile('Application.ts'), // prefix = 160
    ];
    const result = filterAndSortFiles(files, 'App');
    expect(result[0].name).toBe('App.vue');
    expect(result[1].name).toBe('Application.ts');
    expect(result[2].name).toBe('MyApp.vue');
  });

  test('handles case-insensitive filtering', () => {
    const files = [createFile('App.vue'), createFile('Main.ts')];
    const result = filterAndSortFiles(files, 'app');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('App.vue');
  });

  test('returns empty array when no matches', () => {
    const files = [createFile('App.vue'), createFile('Main.ts')];
    const result = filterAndSortFiles(files, 'xyz');
    expect(result).toHaveLength(0);
  });

  test('handles files with null path', () => {
    const files = [createFile('App.vue', null), createFile('Main.ts', null)];
    const result = filterAndSortFiles(files, 'App');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('App.vue');
  });
});
