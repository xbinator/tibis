# BWidget 安全模板表达式设计

## 背景

BWidget 的 `{{ ... }}` 绑定当前只支持变量路径，例如 `{{ movie.scoreText }}`。用户能够输入 Vue 风格的三元表达式，但运行态路径解析失败后只会回退原始模板，导致 `{{ movie.hasScore ? movie.scoreText : '暂无' }}` 无法得到预期结果。

Vue 模板表达式由构建工具编译受信任源码；BWidget 内容是在运行时加载的用户数据，不能使用 `eval`、`new Function` 或其它动态代码执行方式。需要增加受限表达式语言，在支持常用展示逻辑的同时保持数据只读和执行边界可审计。

## 目标

- 支持截图中的条件表达式及常用只读数据运算。
- 保留现有简单路径、循环局部变量、混合文本和失败回退行为。
- 不执行任意 JavaScript，不访问浏览器或 Node.js 全局对象。
- 设计态继续隐藏绑定，运行态才求值。
- 不改变 Widget 保存格式，不迁移已有数据。

## 支持语法

第一期支持：

- 属性访问：`movie.scoreText`
- 下标访问：`movies[0]`、`movie['scoreText']`
- 可选链：`movie?.scoreText`、`movies?.[0]`
- 字面量：字符串、数字、`true`、`false`、`null`
- 一元运算：`!`、一元 `+`、一元 `-`
- 算术运算：`+`、`-`、`*`、`/`、`%`
- 比较运算：`===`、`!==`、`==`、`!=`、`>`、`>=`、`<`、`<=`
- 逻辑运算：`&&`、`||`
- 空值合并：`??`
- 条件表达式：`condition ? valueA : valueB`
- 括号：控制运算优先级

第一期明确禁止：

- 函数和方法调用：`fetch(url)`、`movie.format()`
- 赋值和复合赋值：`movie.score = 10`、`count += 1`
- 自增、自减：`count++`、`--count`
- 构造与动态代码：`new Date()`、`eval(...)`、`Function(...)`
- 模板字符串、对象字面量、数组字面量、箭头函数、类、`await`、`yield`
- 全局对象：`window`、`document`、`globalThis`、`process`
- 不安全属性：`__proto__`、`prototype`、`constructor`

## 架构

### 表达式模块

新增 `src/components/BWidget/utils/widgetExpression.ts`，只负责两件事：

1. 使用项目已有的 TypeScript parser 将单个表达式解析为 AST。
2. 使用白名单解释器递归求值允许的 AST 节点。

模块不生成代码、不执行 AST，也不读取词法作用域之外的变量。公开接口返回 `{ resolved, value }`，非法语法、不支持节点、缺失路径和运行错误统一返回 `resolved: false`。

### 作用域

表达式只能从以下根读取值：

- `$input`：Widget 输入
- `$output`：Widget 执行结果
- Widget data 的顶层字段，例如 `movie`
- 循环局部变量，例如 `item`、`index` 或用户配置的局部变量名

`data.movie` 继续视为 data 中名为 `data` 的普通路径，不新增显式 `data` 根，保持现有绑定契约。

属性读取必须检查不安全片段，并只在当前数据值上读取。标识符不会回退到 JavaScript 全局作用域，因此 `window.location` 只有在 Widget data 确实声明了普通字段 `window` 时才可能读取；同时保留全局根名称黑名单，使这些名称即便出现在 data 中也不作为表达式根暴露。

### 模板集成

`src/components/BWidget/utils/widgetBindings.ts` 保留模板匹配、混合文本拼接、展示格式化和失败回退职责。现有 `evaluateWidgetBindingExpression` 改为委托表达式模块，因此简单路径和新表达式共享同一求值入口。

- 整个字段是一个绑定时，返回表达式原始类型，例如布尔值或数字。
- 混合文本中的表达式统一格式化为字符串。
- 任一混合表达式无法解析时，继续回退完整原始模板，保持现有兼容行为。
- 设计态不调用求值器，仍移除 `{{ ... }}` 绑定占位。

## 求值语义

- 运算优先级由 TypeScript parser 生成的 AST 决定，解释器不自行重排。
- `&&`、`||`、`??` 和三元表达式使用短路求值，未选中的分支不访问数据。
- 可选链遇到 `null` 或 `undefined` 返回 `undefined`，不会抛错。
- 可读对象缺少目标自有属性时得到 `undefined`，因此 `movie.score ?? '暂无'` 能够回退；普通属性访问遇到 `null`、`undefined` 或非对象值时返回 unresolved。
- 顶层表达式最终得到 `undefined` 时保持现有契约，向模板层报告 unresolved；表达式内部的 `undefined` 仍可参与 `??`、`&&`、`||` 和三元短路。
- `+` 遵循 JavaScript 的数字相加或字符串拼接语义；其它算术运算使用 JavaScript 对应运算符。
- 严格比较和宽松比较均按各自 JavaScript 语义执行，以贴近 Vue 表达式使用习惯。
- 除明确允许的运算外，所有 AST 节点默认拒绝。

## 错误与安全

- parser 语法诊断、额外语句或表达式尾部垃圾内容均判为 unresolved。
- AST 求值深度上限为 64 层，超过时返回 unresolved，避免恶意深层嵌套造成递归耗尽。
- 表达式长度上限为 2048 个 UTF-16 code units，超过时不进入 parser 并返回 unresolved。
- 属性访问使用 `Object.getOwnPropertyDescriptor` 和不安全片段检查，不沿原型链读取；访问器属性（getter/setter）直接返回 unresolved，只允许读取 descriptor 的数据值。
- 禁止调用节点意味着无法借助数据中的函数突破边界。

## 测试

### 正常行为

- 截图表达式在有评分和无评分时分别返回 `movie.scoreText` 与 `暂无`。
- 算术、比较、逻辑、空值合并、括号和一元运算遵循预期优先级。
- `&&`、`||`、`??`、三元表达式只求值需要的分支。
- 属性、字符串下标、数字下标、可选链、`$input`、`$output` 和循环 locals 正常工作。
- 整体绑定保留值类型，混合文本正确字符串化。

### 拒绝行为

- 函数调用、方法调用、赋值、自增、`new`、模板字符串、数组/对象字面量和箭头函数返回 unresolved。
- `window`、`document`、`globalThis`、`process` 与不安全属性路径返回 unresolved。
- 语法错误、超长表达式和超深嵌套返回 unresolved。
- 未解析表达式继续触发现有模板回退。

## 非目标

- 不追求完整 Vue 或 JavaScript 表达式兼容。
- 不支持自定义函数、过滤器、管道或格式化 helper。
- 不在本次增加编辑器语法高亮、自动完成或错误提示 UI。
- 不改变 BSmart 变量选择器生成的简单路径格式。
