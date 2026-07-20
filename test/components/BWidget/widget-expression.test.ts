/**
 * @file widget-expression.test.ts
 * @description 验证 BWidget 安全模板表达式的解析、读取和拒绝边界。
 */
import { describe, expect, it } from 'vitest';
import { evaluateWidgetExpression, type WidgetExpressionHost, type WidgetExpressionReadResult } from '@/components/BWidget/utils/widgetExpression';

/** 测试宿主禁止暴露的根名称。 */
const BLOCKED_TEST_ROOTS = new Set<string>(['window', 'document', 'globalThis', 'process']);
/** 测试宿主禁止读取的属性名称。 */
const UNSAFE_TEST_PROPERTIES = new Set<string>(['__proto__', 'prototype', 'constructor']);

/**
 * 创建未解析结果。
 * @returns 未解析结果
 */
function createUnresolvedResult(): WidgetExpressionReadResult {
  return {
    resolved: false,
    value: undefined
  };
}

/**
 * 通过自有数据属性读取测试值。
 * @param target - 目标对象
 * @param key - 属性名称或下标
 * @returns 属性读取结果
 */
function readOwnValue(target: unknown, key: string | number): WidgetExpressionReadResult {
  if (target === null || typeof target !== 'object') {
    return createUnresolvedResult();
  }

  const propertyName = String(key);
  if (UNSAFE_TEST_PROPERTIES.has(propertyName)) {
    return createUnresolvedResult();
  }

  const descriptor = Object.getOwnPropertyDescriptor(target, propertyName);
  if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
    return descriptor
      ? createUnresolvedResult()
      : {
          resolved: true,
          value: undefined
        };
  }

  return {
    resolved: true,
    value: descriptor.value
  };
}

/**
 * 创建仅能读取给定作用域的表达式测试宿主。
 * @param scope - 测试作用域
 * @returns 表达式宿主
 */
function createHost(scope: Record<string, unknown>): WidgetExpressionHost {
  return {
    readIdentifier: (name: string): WidgetExpressionReadResult => {
      if (BLOCKED_TEST_ROOTS.has(name)) {
        return createUnresolvedResult();
      }

      return readOwnValue(scope, name);
    },
    readProperty: (target: unknown, key: string | number): WidgetExpressionReadResult => readOwnValue(target, key)
  };
}

/**
 * 使用固定测试作用域求值表达式。
 * @param expression - 待求值表达式
 * @param scopeOverrides - 额外测试作用域字段
 * @returns 表达式读取结果
 */
function evaluate(expression: string, scopeOverrides: Record<string, unknown> = {}): WidgetExpressionReadResult {
  const scope: Record<string, unknown> = {
    movie: {
      hasScore: true,
      score: 8.6,
      title: '示例电影'
    },
    movies: [{ title: '第一部' }],
    propertyName: 'title',
    nullable: null,
    ...scopeOverrides
  };

  return evaluateWidgetExpression(expression, createHost(scope));
}

describe('widgetExpression parser and reads', (): void => {
  it('reads literals and host-backed properties without executable code', (): void => {
    expect(evaluate('movie.score')).toEqual({ resolved: true, value: 8.6 });
    expect(evaluate("movie['title']")).toEqual({ resolved: true, value: '示例电影' });
    expect(evaluate('movie[propertyName]')).toEqual({ resolved: true, value: '示例电影' });
    expect(evaluate('movies[0].title')).toEqual({ resolved: true, value: '第一部' });
    expect(evaluate("'暂无'")).toEqual({ resolved: true, value: '暂无' });
    expect(evaluate('12.5')).toEqual({ resolved: true, value: 12.5 });
    expect(evaluate('true')).toEqual({ resolved: true, value: true });
    expect(evaluate('false')).toEqual({ resolved: true, value: false });
    expect(evaluate('null')).toEqual({ resolved: true, value: null });
  });

  it('supports optional property and element access while keeping top-level undefined unresolved', (): void => {
    expect(evaluate('nullable?.title')).toEqual({ resolved: false, value: undefined });
    expect(evaluate('nullable?.[0]')).toEqual({ resolved: false, value: undefined });
    expect(evaluate('movie.missing')).toEqual({ resolved: false, value: undefined });
    expect(evaluate('movie.missing.title')).toEqual({ resolved: false, value: undefined });
  });

  it('does not read inherited or accessor properties', (): void => {
    let getterReads = 0;
    const inheritedMovie = Object.create({ inherited: '不可见' }) as Record<string, unknown>;
    Object.defineProperty(inheritedMovie, 'computed', {
      enumerable: true,
      get: (): string => {
        getterReads += 1;
        return '不可执行';
      }
    });

    expect(evaluate('movie.inherited', { movie: inheritedMovie })).toEqual({ resolved: false, value: undefined });
    expect(evaluate('movie.computed', { movie: inheritedMovie })).toEqual({ resolved: false, value: undefined });
    expect(getterReads).toBe(0);
  });

  it('rejects executable, mutating and unsafe expressions', (): void => {
    const templateExpression = ['`score: ', '$', '{movie.score}', '`'].join('');
    const blockedExpressions = [
      'fetch(url)',
      'movie.format()',
      'movie.score = 10',
      'count++',
      '--count',
      'new Date()',
      '({ value: 1 })',
      '[1, 2]',
      'value => value',
      templateExpression,
      'window.location',
      'document.title',
      'globalThis.process',
      'process.env',
      'movie.constructor',
      'movie.__proto__'
    ];

    blockedExpressions.forEach((expression: string): void => {
      expect(evaluate(expression), expression).toEqual({ resolved: false, value: undefined });
    });
  });

  it('rejects malformed, trailing, over-length and over-depth expressions', (): void => {
    const trailingStatement = '1); movie.score = 10; (2';
    const overLengthExpression = 'x'.repeat(2049);
    const overDepthExpression = `${'('.repeat(70)}1${')'.repeat(70)}`;

    expect(evaluate('')).toEqual({ resolved: false, value: undefined });
    expect(evaluate('movie.')).toEqual({ resolved: false, value: undefined });
    expect(evaluate(trailingStatement)).toEqual({ resolved: false, value: undefined });
    expect(evaluate(overLengthExpression)).toEqual({ resolved: false, value: undefined });
    expect(evaluate(overDepthExpression)).toEqual({ resolved: false, value: undefined });
  });
});

describe('widgetExpression operators', (): void => {
  it('preserves JavaScript precedence for safe operators', (): void => {
    expect(evaluate('1 + 2 * 3')).toEqual({ resolved: true, value: 7 });
    expect(evaluate('(1 + 2) * 3')).toEqual({ resolved: true, value: 9 });
    expect(evaluate("movie.score >= 8 && movie.title === '示例电影'")).toEqual({ resolved: true, value: true });
    expect(evaluate("movie.missing ?? '暂无'")).toEqual({ resolved: true, value: '暂无' });
  });

  it('supports approved unary and arithmetic operators for primitive values', (): void => {
    const cases: Array<[string, unknown]> = [
      ['!false', true],
      ["+'12'", 12],
      ["-'2'", -2],
      ['5 - 2', 3],
      ['3 * 4', 12],
      ['8 / 2', 4],
      ['7 % 4', 3],
      ["'评分：' + movie.score", '评分：8.6'],
      ['true + 1', 2]
    ];

    cases.forEach(([expression, expectedValue]: [string, unknown]): void => {
      expect(evaluate(expression), expression).toEqual({ resolved: true, value: expectedValue });
    });
  });

  it('supports approved equality and ordering comparisons', (): void => {
    const cases: Array<[string, boolean]> = [
      ['1 === 1', true],
      ['1 !== 2', true],
      ["'1' == 1", true],
      ["'1' != 2", true],
      ['2 > 1', true],
      ['2 >= 2', true],
      ['1 < 2', true],
      ['2 <= 2', true],
      ["'b' > 'a'", true]
    ];

    cases.forEach(([expression, expectedValue]: [string, boolean]): void => {
      expect(evaluate(expression), expression).toEqual({ resolved: true, value: expectedValue });
    });
  });

  it('evaluates only the selected short-circuit branch', (): void => {
    expect(evaluate('false && blocked.value')).toEqual({ resolved: true, value: false });
    expect(evaluate('true || blocked.value')).toEqual({ resolved: true, value: true });
    expect(evaluate("'已有' ?? blocked.value")).toEqual({ resolved: true, value: '已有' });
    expect(evaluate('movie.hasScore ? movie.score : blocked.value')).toEqual({ resolved: true, value: 8.6 });
    expect(evaluate("false ? blocked.value : '暂无'")).toEqual({ resolved: true, value: '暂无' });
  });

  it('does not coerce objects while evaluating arithmetic or ordering', (): void => {
    let coercionReads = 0;
    const unsafeValue = Object.defineProperty({}, 'valueOf', {
      get: (): (() => number) => {
        coercionReads += 1;
        return (): number => 1;
      }
    });

    expect(evaluate('unsafeValue + 1', { unsafeValue })).toEqual({ resolved: false, value: undefined });
    expect(evaluate('unsafeValue < 2', { unsafeValue })).toEqual({ resolved: false, value: undefined });
    expect(coercionReads).toBe(0);
  });

  it('rejects operators outside the approved subset', (): void => {
    const blockedExpressions = [
      '1 | 2',
      '1 & 2',
      '1 ^ 2',
      '1 << 2',
      '1, 2',
      "'score' in movie",
      'movie instanceof Object',
      '2 ** 3',
      'typeof movie',
      'void movie',
      'delete movie.score',
      '~1'
    ];

    blockedExpressions.forEach((expression: string): void => {
      expect(evaluate(expression), expression).toEqual({ resolved: false, value: undefined });
    });
  });
});
