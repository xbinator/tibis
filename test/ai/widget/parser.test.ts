/**
 * @file parser.test.ts
 * @description Widget JSON 内容版本测试。
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
