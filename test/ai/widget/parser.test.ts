/**
 * @file parser.test.ts
 * @description Widget JSON 内容版本与 dirPath 计算测试。
 */
import { describe, expect, it } from 'vitest';
import { parseWidgetJson } from '@/ai/widget';
import { hashString } from '@/shared/utils/hash';

describe('parseWidgetJson content hash', (): void => {
  it('records a stable hash of the complete source text', (): void => {
    const source = JSON.stringify({ name: 'Weather', description: 'Old description' });
    const changedSource = JSON.stringify({ name: 'Weather', description: 'New description' });

    expect(parseWidgetJson(source, '/widgets/weather/widget.json').contentHash).toBe(hashString(source));
    expect(parseWidgetJson(changedSource, '/widgets/weather/widget.json').contentHash).not.toBe(hashString(source));
  });

  it('records the source hash when parsing fails', (): void => {
    const source = '{broken';

    expect(parseWidgetJson(source, '/widgets/broken/widget.json').contentHash).toBe(hashString(source));
  });
});

describe('parseWidgetJson dirPath', (): void => {
  it('exposes the parent directory of the widget.json file path', (): void => {
    const widget = parseWidgetJson('{"name":"天气","description":"查询天气"}', '/home/.tibis/widgets/weather/widget.json');
    expect(widget.dirPath).toBe('/home/.tibis/widgets/weather');
  });

  it('normalizes backslash separators when deriving dirPath', (): void => {
    const widget = parseWidgetJson('{"name":"天气","description":"查询天气"}', 'C:\\Users\\test\\.tibis\\widgets\\weather\\widget.json');
    expect(widget.dirPath).toBe('C:/Users/test/.tibis/widgets/weather');
  });

  it('populates dirPath even when JSON parsing fails', (): void => {
    const widget = parseWidgetJson('{broken', '/home/.tibis/widgets/broken/widget.json');
    expect(widget.dirPath).toBe('/home/.tibis/widgets/broken');
  });
});
