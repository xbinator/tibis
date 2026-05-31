/**
 * @file theme-apply.test.ts
 * @description 验证主题运行时注入（applyCssVars）和开发时校验（validateTokens）的正确性。
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { light } from '@/theme';
import type { ThemeTokens } from '@/theme';

/**
 * 模拟 DOM 环境：捕获 createElement / head.appendChild / querySelector 调用。
 */
function createDomStub() {
  const createdElements: HTMLElement[] = [];
  const appendedChildren: HTMLElement[] = [];
  const removedChildren: HTMLElement[] = [];
  let existingStyleEl: HTMLStyleElement | null = null;

  const head = {
    appendChild: vi.fn((el: HTMLElement) => {
      appendedChildren.push(el);
      existingStyleEl = el as HTMLStyleElement;
    }),
    removeChild: vi.fn((el: HTMLElement) => {
      removedChildren.push(el);
      existingStyleEl = null;
    })
  };

  const document = {
    head,
    querySelector: vi.fn((_sel: string) => existingStyleEl),
    createElement: vi.fn((tag: string) => {
      const el = { tagName: tag.toUpperCase(), textContent: '', setAttribute: vi.fn() } as unknown as HTMLElement;
      createdElements.push(el);
      return el;
    })
  };

  return { document, createdElements, appendedChildren, removedChildren };
}

describe('applyCssVars', () => {
  let stub: ReturnType<typeof createDomStub>;

  beforeAll(async () => {
    stub = createDomStub();
    vi.stubGlobal('document', stub.document);

    const { applyCssVars } = await import('@/theme/core/apply');
    applyCssVars(light);
  });

  it('创建一个 <style> 标签', () => {
    expect(stub.document.createElement).toHaveBeenCalledWith('style');
    expect(stub.createdElements[0].tagName).toBe('STYLE');
  });

  it('为 <style> 标签设置 data-theme-styles 属性', () => {
    const styleEl = stub.createdElements[0];
    expect(styleEl.setAttribute).toHaveBeenCalledWith('data-theme-styles', '');
  });

  it('将 <style> 标签追加到 document.head', () => {
    expect(stub.document.head.appendChild).toHaveBeenCalledTimes(1);
    expect(stub.appendedChildren[0].tagName).toBe('STYLE');
  });

  it('生成 :root 规则包含 --bg-primary', () => {
    const styleEl = stub.appendedChildren[0] as unknown as { textContent: string };
    expect(styleEl.textContent).toContain('--bg-primary: #faf9f6');
  });

  it('生成 :root 规则包含 --text-primary', () => {
    const styleEl = stub.appendedChildren[0] as unknown as { textContent: string };
    expect(styleEl.textContent).toContain('--text-primary: #1a1a1a');
  });

  it('生成 :root 规则包含 --color-primary', () => {
    const styleEl = stub.appendedChildren[0] as unknown as { textContent: string };
    expect(styleEl.textContent).toContain('--color-primary: #8a6f5a');
  });

  it('textContext 以 :root { 开头', () => {
    const styleEl = stub.appendedChildren[0] as unknown as { textContent: string };
    expect(styleEl.textContent.startsWith(':root {')).toBe(true);
  });
});

describe('applyCssVars 二次调用', () => {
  it('复用已有 <style> 标签，仅更新 textContent', async () => {
    const stub = createDomStub();
    vi.stubGlobal('document', stub.document);

    vi.resetModules();
    const { applyCssVars } = await import('@/theme/core/apply');

    applyCssVars(light);
    expect(stub.appendedChildren.length).toBe(1);

    stub.document.querySelector = vi.fn(() => stub.appendedChildren[0] as unknown as HTMLStyleElement);

    applyCssVars(light);
    expect(stub.document.head.removeChild).not.toHaveBeenCalled();
    expect(stub.appendedChildren.length).toBe(1);

    vi.unstubAllGlobals();
  });
});

describe('validateTokens', () => {
  it('在 DEV 环境下对合法 token 不输出警告', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => void 0);

    const { validateTokens } = await import('@/theme/core/apply');
    validateTokens(light, 'light');

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('在 DEV 环境下对非法格式 token 输出警告', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => void 0);

    const { validateTokens } = await import('@/theme/core/apply');
    const badTokens: ThemeTokens = {
      ...light,
      bg: { ...light.bg, primary: 'not-a-color' }
    };

    validateTokens(badTokens, 'bad');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('--bg-primary'));
    warnSpy.mockRestore();
  });
});
