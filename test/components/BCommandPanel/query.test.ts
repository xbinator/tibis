/**
 * @file query.test.ts
 * @description 验证 BCommandPanel 输入内容到 source 的路由解析。
 */
import { describe, expect, it } from 'vitest';
import { parseCommandPanelQuery } from '@/components/BCommandPanel/utils/query';

describe('parseCommandPanelQuery', (): void => {
  it('routes model scope to model source for every input', (): void => {
    expect(parseCommandPanelQuery('model', '')).toEqual({ sourceId: 'model', keyword: '' });
    expect(parseCommandPanelQuery('model', 'qwen')).toEqual({ sourceId: 'model', keyword: 'qwen' });
    expect(parseCommandPanelQuery('model', '>')).toEqual({ sourceId: 'model', keyword: '>' });
  });

  it('routes normal recent input to recent source', (): void => {
    expect(parseCommandPanelQuery('recent', '')).toEqual({ sourceId: 'recent', keyword: '' });
    expect(parseCommandPanelQuery('recent', 'alpha')).toEqual({ sourceId: 'recent', keyword: 'alpha' });
  });

  it('routes incomplete jump input to jump source', (): void => {
    expect(parseCommandPanelQuery('recent', '>')).toEqual({ sourceId: 'jump', keyword: '' });
    expect(parseCommandPanelQuery('recent', '> mo')).toEqual({ sourceId: 'jump', keyword: 'mo' });
    expect(parseCommandPanelQuery('recent', '> models')).toEqual({ sourceId: 'jump', keyword: 'models' });
    expect(parseCommandPanelQuery('recent', '> modelx')).toEqual({ sourceId: 'jump', keyword: 'modelx' });
  });

  it('routes model jump command to model source', (): void => {
    expect(parseCommandPanelQuery('recent', '> model')).toEqual({ sourceId: 'model', keyword: '' });
    expect(parseCommandPanelQuery('recent', '> model ')).toEqual({ sourceId: 'model', keyword: '' });
    expect(parseCommandPanelQuery('recent', '> model qwen')).toEqual({ sourceId: 'model', keyword: 'qwen' });
    expect(parseCommandPanelQuery('recent', '> model qwen extra')).toEqual({ sourceId: 'model', keyword: 'qwen extra' });
  });
});
