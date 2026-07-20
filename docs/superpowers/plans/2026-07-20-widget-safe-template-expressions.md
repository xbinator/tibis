# BWidget Safe Template Expressions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evaluate a safe Vue-like subset inside BWidget `{{ ... }}` bindings without `eval`, dynamic code generation, function calls, mutation, or global access.

**Architecture:** Parse one expression with the existing TypeScript parser, then recursively interpret only an explicit AST whitelist. Keep identifier/property access behind a host interface owned by `widgetBindings.ts`, so the expression engine cannot access JavaScript scope or object prototypes and the existing template fallback behavior remains unchanged.

**Tech Stack:** TypeScript compiler AST, TypeScript 5.9, Vitest, Vue 3

## Global Constraints

- Never use `eval`, `new Function`, dynamic import, script injection, or generated executable code.
- Support property/index access, optional chaining, string/number/boolean/null literals, `!`, unary `+`/`-`, arithmetic, comparison, `&&`, `||`, `??`, ternary expressions, and parentheses.
- Reject calls, assignments, updates, `new`, template literals, object/array literals, functions, classes, `await`, `yield`, and every AST node not explicitly allowed.
- Expression length limit is 2048 UTF-16 code units; evaluation depth limit is 64.
- Do not read prototype properties or accessors; reject `__proto__`, `prototype`, and `constructor`.
- Do not expose `window`, `document`, `globalThis`, or `process`, even when Widget data contains fields with those names.
- Preserve whole-binding value types, mixed-text formatting, unresolved fallback, design-mode hiding, and persisted Widget data.
- Do not use `any`; annotate all function parameters and returns, and add JSDoc for functions/interfaces.
- Do not stage or commit; the user will commit.
- Add a change entry to `changelog/2026-07-20.md`.

---

### Task 1: Parse expressions and safely read values

**Files:**
- Create: `src/components/BWidget/utils/widgetExpression.ts`
- Create: `test/components/BWidget/widget-expression.test.ts`

**Interfaces:**
- Produces: `WidgetExpressionReadResult { resolved: boolean; value: unknown }`
- Produces: `WidgetExpressionHost { readIdentifier(name): WidgetExpressionReadResult; readProperty(target, key): WidgetExpressionReadResult }`
- Produces: `evaluateWidgetExpression(expression, host): WidgetExpressionReadResult`

- [x] **Step 1: Write failing parser and value-read tests**

Create `widget-expression.test.ts` with a plain host backed by `scope` and own-property descriptors. Cover literals, identifiers, dot/bracket access, optional access, missing properties, unsafe roots/properties, calls, assignments, array/object literals, malformed input, over-length input, and over-depth input.

```ts
it('reads literals and host-backed properties without executable code', (): void => {
  expect(evaluate('movie.score')).toEqual({ resolved: true, value: 8.6 });
  expect(evaluate("movie['title']")).toEqual({ resolved: true, value: '示例电影' });
  expect(evaluate('movies[0].title')).toEqual({ resolved: true, value: '第一部' });
  expect(evaluate("'暂无'")).toEqual({ resolved: true, value: '暂无' });
});

it('rejects executable, mutating and unsafe expressions', (): void => {
  ['fetch(url)', 'movie.format()', 'movie.score = 10', 'count++', 'new Date()', '({ value: 1 })', '[1, 2]', 'window.location', 'movie.constructor'].forEach(
    (expression: string): void => {
      expect(evaluate(expression).resolved).toBe(false);
    }
  );
});
```

- [x] **Step 2: Run the new test and verify RED**

Run: `pnpm vitest run test/components/BWidget/widget-expression.test.ts`

Expected: FAIL because `widgetExpression.ts` does not exist.

- [x] **Step 3: Implement the expression boundary and primitive readers**

Create the module with these public contracts and constants:

```ts
export interface WidgetExpressionReadResult {
  /** 是否成功读取或计算 */
  resolved: boolean;
  /** 读取或计算结果 */
  value: unknown;
}

export interface WidgetExpressionHost {
  readIdentifier(name: string): WidgetExpressionReadResult;
  readProperty(target: unknown, key: string | number): WidgetExpressionReadResult;
}

const WIDGET_EXPRESSION_MAX_LENGTH = 2048;
const WIDGET_EXPRESSION_MAX_DEPTH = 64;
```

Parse `(${expression});` with `ts.createSourceFile`, require exactly one `ExpressionStatement` whose expression is `ParenthesizedExpression`, and reject parser diagnostics. Recursively allow `ParenthesizedExpression`, `Identifier`, string/numeric literals, and `true`/`false`/`null`. Pass identifier and property reads to the host.

Property and element access must treat any TypeScript optional-chain node as nullish-safe:

```ts
const isOptionalChain = ts.isPropertyAccessChain(node) || ts.isElementAccessChain(node);
if (target.value === null || target.value === undefined) {
  return isOptionalChain ? createResolvedResult(undefined) : createUnresolvedResult();
}
```

At the public boundary, convert a valid top-level `undefined` result to unresolved so existing template fallback semantics remain intact; internal `undefined` results stay valid for later `??` support.

- [x] **Step 4: Run the new test and verify GREEN**

Run: `pnpm vitest run test/components/BWidget/widget-expression.test.ts`

Expected: PASS for parser, safe reads, limits, and rejection cases implemented in this task.

### Task 2: Interpret whitelisted operators with short-circuit semantics

**Files:**
- Modify: `src/components/BWidget/utils/widgetExpression.ts`
- Modify: `test/components/BWidget/widget-expression.test.ts`

**Interfaces:**
- Consumes: `evaluateWidgetExpression(expression, host)`
- Produces: allowed prefix, binary, nullish, and conditional evaluation without extending the public API.

- [x] **Step 1: Add failing operator and short-circuit tests**

```ts
it('preserves JavaScript precedence for safe operators', (): void => {
  expect(evaluate('1 + 2 * 3').value).toBe(7);
  expect(evaluate('(1 + 2) * 3').value).toBe(9);
  expect(evaluate("movie.score >= 8 && movie.title === '示例电影'").value).toBe(true);
  expect(evaluate("movie.missing ?? '暂无'").value).toBe('暂无');
});

it('evaluates only the selected short-circuit branch', (): void => {
  expect(evaluate("false && blocked.value")).toEqual({ resolved: true, value: false });
  expect(evaluate("true || blocked.value")).toEqual({ resolved: true, value: true });
  expect(evaluate("movie.hasScore ? movie.scoreText : blocked.value").value).toBe('8.6');
});
```

Add table cases for unary operators, arithmetic, all approved comparisons, `&&`, `||`, `??`, ternary, and parentheses. Add rejection cases for bitwise operators, comma, `in`, `instanceof`, exponentiation, `typeof`, `void`, and `delete` because they are outside the approved first-phase subset.

- [x] **Step 2: Run the expression test and verify RED**

Run: `pnpm vitest run test/components/BWidget/widget-expression.test.ts`

Expected: FAIL because operators and conditional expressions are not yet interpreted.

- [x] **Step 3: Implement operator dispatch**

Add focused evaluators with explicit `switch` statements:

```ts
function evaluatePrefix(node: ts.PrefixUnaryExpression, host: WidgetExpressionHost, depth: number): WidgetExpressionNodeResult;
function evaluateBinary(node: ts.BinaryExpression, host: WidgetExpressionHost, depth: number): WidgetExpressionNodeResult;
function evaluateConditional(node: ts.ConditionalExpression, host: WidgetExpressionHost, depth: number): WidgetExpressionNodeResult;
```

Evaluate `&&`, `||`, `??`, and ternary branches lazily. For non-short-circuit operators, require both operands to resolve. Never coerce objects through `valueOf` or `toString`; arithmetic and ordering accept only primitive operands. Strict equality may compare any values by identity; loose equality accepts primitive operands only and uses a localized `eqeqeq` lint suppression.

The node dispatcher must remain default-deny:

```ts
if (ts.isPrefixUnaryExpression(node)) return evaluatePrefix(node, host, depth);
if (ts.isBinaryExpression(node)) return evaluateBinary(node, host, depth);
if (ts.isConditionalExpression(node)) return evaluateConditional(node, host, depth);
return createUnresolvedResult();
```

- [x] **Step 4: Run expression tests and verify GREEN**

Run: `pnpm vitest run test/components/BWidget/widget-expression.test.ts`

Expected: PASS for all approved operators, precedence, short-circuit behavior, and rejected syntax.

### Task 3: Integrate safe expressions into Widget bindings

**Files:**
- Modify: `src/components/BWidget/utils/widgetBindings.ts`
- Modify: `test/components/BWidget/widget-bindings.test.ts`
- Modify: `test/components/BWidget/text-element-view.component.test.ts`

**Interfaces:**
- Consumes: `evaluateWidgetExpression(expression, host)`
- Preserves: `evaluateWidgetBindingExpression(expression, context, options): { resolved, value }`
- Preserves: `resolveWidgetTemplateValue(template, context, options): unknown`

- [x] **Step 1: Add failing binding and component tests for the reported expression**

```ts
it('resolves safe conditional expressions in widget templates', (): void => {
  const context = createRenderContext();
  context.data.movie = { hasScore: true, scoreText: '8.6' };

  expect(resolveWidgetTemplateValue("{{ movie.hasScore ? movie.scoreText : '暂无' }}", context)).toBe('8.6');
  context.data.movie = { hasScore: false, scoreText: '8.6' };
  expect(resolveWidgetTemplateValue("{{ movie.hasScore ? movie.scoreText : '暂无' }}", context)).toBe('暂无');
});
```

Retain the old “does not execute filter-like binding expressions” component regression, add an approved ternary-expression case, and add an explicit call case such as `{{ movie.format() }}` that must remain raw fallback text.

- [x] **Step 2: Run binding and text component tests and verify RED**

Run: `pnpm vitest run test/components/BWidget/widget-bindings.test.ts test/components/BWidget/text-element-view.component.test.ts`

Expected: FAIL because `evaluateWidgetBindingExpression` still accepts paths only.

- [x] **Step 3: Build a safe binding host and delegate evaluation**

In `widgetBindings.ts`, construct the host from the existing context contract:

```ts
const BLOCKED_WIDGET_EXPRESSION_ROOTS = new Set<string>(['window', 'document', 'globalThis', 'process']);

function createExpressionHost(
  context: WidgetRenderContext,
  options: WidgetBindingEvaluationOptions
): WidgetExpressionHost {
  const scope = createBindingScope(context, options);

  return {
    readIdentifier: (name: string): WidgetExpressionReadResult => readExpressionIdentifier(scope, name),
    readProperty: (target: unknown, key: string | number): WidgetExpressionReadResult => readExpressionProperty(target, key)
  };
}
```

Identifier precedence remains `$input`/`$output`, then locals, then data. Reject blocked root names. Property reads must reject unsafe names, require an object/array target, require an own property descriptor, reject accessors, and return a valid internal `undefined` for missing own properties.

Change only `evaluateWidgetBindingExpression` to call `evaluateWidgetExpression(expression.trim(), createExpressionHost(context, options))`. Keep path parsing/formatting exports for loop sources and variable-option generation, but remove now-unused old path-value evaluation helpers.

- [x] **Step 4: Run binding, view, loop, variables, and size tests**

Run:

```bash
pnpm vitest run \
  test/components/BWidget/widget-expression.test.ts \
  test/components/BWidget/widget-bindings.test.ts \
  test/components/BWidget/text-element-view.component.test.ts \
  test/components/BWidget/use-element-value.test.ts \
  test/components/BWidget/use-element-variables.test.ts \
  test/components/BWidget/widget-loop.test.ts \
  test/components/BWidget/widget-geometry.test.ts \
  test/components/BWidget/widget-runtime-layout.test.ts \
  test/components/BWidget/moveable-layer.component.test.ts
```

Expected: PASS; the ternary controls visible content and measured runtime size while design mode remains empty.

### Task 4: Record and verify the feature

**Files:**
- Modify: `changelog/2026-07-20.md`
- Verify: all files changed by Tasks 1-3

**Interfaces:**
- No additional runtime interface.

- [x] **Step 1: Add the changelog entry**

Under `## Added`, add:

```md
- BWidget 模板变量新增安全表达式支持，可使用属性访问、可选链、算术/比较/逻辑/空值合并与三元条件，且不执行函数调用或任意 JavaScript。
```

- [x] **Step 2: Run the focused regression suite**

Run:

```bash
pnpm vitest run \
  test/components/BWidget/widget-expression.test.ts \
  test/components/BWidget/widget-bindings.test.ts \
  test/components/BWidget/text-element-view.component.test.ts \
  test/components/BWidget/use-element-value.test.ts \
  test/components/BWidget/use-element-variables.test.ts \
  test/components/BWidget/widget-loop.test.ts \
  test/components/BWidget/widget-geometry.test.ts \
  test/components/BWidget/widget-runtime-layout.test.ts \
  test/components/BWidget/moveable-layer.component.test.ts
```

Expected: all listed files and tests PASS.

- [x] **Step 3: Run static checks**

Run: `pnpm exec tsc --noEmit`

Expected: exit code `0`.

Run:

```bash
pnpm exec eslint \
  src/components/BWidget/utils/widgetExpression.ts \
  src/components/BWidget/utils/widgetBindings.ts \
  test/components/BWidget/widget-expression.test.ts \
  test/components/BWidget/widget-bindings.test.ts \
  test/components/BWidget/text-element-view.component.test.ts
```

Expected: exit code `0` with no new warnings.

Run: `pnpm exec stylelint 'src/components/BWidget/**/*.{vue,less,css}'`

Expected: exit code `0`.

- [x] **Step 4: Review local changes without staging**

Run: `git diff --check`, `git status --short`, and `git diff --stat` as separate read-only commands.

Expected: no whitespace errors; feature code, tests, docs, and changelog remain unstaged for the user.

### Task 5: Close the object-formatting execution boundary

**Files:**
- Modify: `src/components/BWidget/utils/widgetBindings.ts`
- Test: `test/components/BWidget/widget-bindings.test.ts`
- Modify: `changelog/2026-07-20.md`

**Interfaces:**
- Preserve: `formatWidgetDisplayTextValue(value: unknown): string`
- Preserve: `resolveWidgetBindingTemplate(template, context, fallback, options): unknown`
- Add only private helpers that convert object values into descriptor-read JSON-safe data.

- [x] **Step 1: Add failing mixed-template security tests**

Add separate tests proving that formatting `{{ payload }}` inside mixed text neither reads an enumerable getter nor calls an own `toJSON` method. Each test must assert the call counter remains `0` and that ordinary own data properties are still rendered.

- [x] **Step 2: Run the binding test and verify RED**

Run: `pnpm vitest run test/components/BWidget/widget-bindings.test.ts`

Expected: FAIL because the current `JSON.stringify` path increments the getter or `toJSON` call counter.

- [x] **Step 3: Normalize objects through own data descriptors**

Replace direct object serialization with a private recursive normalizer that:

- reads only enumerable own data descriptors;
- skips accessor descriptors without invoking them;
- converts nested `bigint` values to strings;
- preserves arrays and the existing `[Circular]` marker;
- omits object properties with `undefined`, function, or symbol values and writes `null` for those array entries;
- creates null-prototype object snapshots and masks array `toJSON` before calling `JSON.stringify` on the safe snapshot.

- [x] **Step 4: Run the binding test and verify GREEN**

Run: `pnpm vitest run test/components/BWidget/widget-bindings.test.ts`

Expected: PASS with both security counters remaining `0`.

- [x] **Step 5: Record and verify the fix**

Add a `Fixed` changelog entry, run the focused BWidget suite, TypeScript, ESLint, Stylelint, `git diff --check`, and leave every change unstaged for the user.
