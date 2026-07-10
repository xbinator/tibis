# Widget Runtime Session 隔离修复设计

## 背景

Widget 显示期会复用同一个沙箱 Session、Widget 实例和 Worker。原有实现把宿主桥接、执行状态、输入输出快照和原型边界分别绑定到了不同生命周期，导致第二轮交互可能超时、接收上一轮异步结果或继续使用首次快照。此外，Session 销毁只阻止新调用，没有完整处理已经排队或尚未返回的任务。

## 方案选择

考虑过三种方案：

1. 每次交互重建 Worker。隔离最彻底，但会丢失 Widget 私有实例状态，且增加启动成本，因此不采用。
2. 给每个异步回调建立完整的异步上下文。理论上最精确，但浏览器 Worker 没有通用的 AsyncLocalStorage，侵入 Promise 运行时也会扩大兼容风险，因此不采用。
3. 保留 Session 和实例复用，统一每轮快照同步、跟踪 Widget 托管异步任务、固定实例原型边界，并在 Worker/组件两侧补齐队列销毁语义。该方案保持现有 API 与性能，是本次采用的方案。

## 设计

### 每轮执行隔离

Widget 适配器为每轮执行创建独立状态，并跟踪 `$http`、`$logger`、`console`、`$sendMessage` 产生的 Promise。所有 `then`、`catch`、`finally` 派生链都会继续登记；用户脚本中的 `Promise.resolve/all/race/allSettled/any` 也通过 Session Promise 门面保持跟踪。运行结果返回前循环排空这些托管任务和异步 helper 调用，使宿主响应触发的 continuation 在本轮完成。异步 helper 若没有被调用方观察且发生拒绝，由本轮 flush 抛出；调用方显式 `await`/`catch` 时仍由用户代码处理。

Worker 宿主桥接的 pending 项记录所属 `runId`。一轮结束时仅拒绝并删除该轮遗留调用；Worker 内部再串行处理 `run` 消息，避免活跃运行 ID 被并发覆盖。

### Session 快照与原型边界

每次沙箱运行都把最新的 input、output 和 data 同步到持久 Session。data 的对象和数组采用递归原位同步，确保 Widget 私有字段缓存的嵌套 Proxy 仍连接当前数据。`WidgetRuntimeSession` 增加生产需要的 `updateState`，Runtime 复用 Session 前将当前可见状态写入 Session。组件本地快照只保留脚本产生的数据和 mounted 标记，value/input/output 始终以最新 props 为准。

Session 初始化时保存实际 Widget 基类原型，后续枚举方法都以该原型作为停止边界，禁止进入 `Object.prototype`。

### 销毁语义

本地沙箱队列在任务真正开始时再次检查 disposed。Runtime 组件维护卸载标记：卸载后队列任务不再启动、失败处理不再创建状态或输出错误，当前 Session 会立即释放。Worker 桥接在 deactivate 时清理该轮 pending 调用。

## 错误处理

- Session 销毁后的新任务和未开始队列任务统一拒绝“沙箱 session 已销毁”。
- 未观察的异步 Widget helper 异常由当前运行失败返回。
- 已观察并处理的 helper 异常不在 flush 阶段重复抛出。
- 运行结束后遗留的 Worker 宿主调用统一拒绝“沙箱运行已结束”。

## 验证范围

- Widget 多轮运行：延迟宿主 continuation、异步 helper 错误、输入输出和数据更新、原型方法白名单。
- 沙箱生命周期：本地队列 dispose、Worker pending 清理、Worker 多轮宿主调用和 run 串行。
- Runtime 生命周期：组件卸载后不执行排队交互、不重建 Session。
- 完整测试、TypeScript、ESLint、Stylelint 和生产构建。
