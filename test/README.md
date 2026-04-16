# Test Directory

自动化测试统一放在 `test/` 目录中，不再分散到业务源码目录。

## 约定
- 测试目录结构尽量映射 `src/` 中对应模块的路径，方便定位源码与测试。
- 测试文件统一使用 `*.test.ts` 命名。
- 纯业务规则优先拆成可独立测试的函数，再在 `test/` 中补对应单测。
- 需要依赖 Vue、路由或平台能力的测试，优先先把核心判定逻辑下沉后再测试，避免测试耦合过重。

## 当前示例
- `test/views/editor/reconcileFileContent.test.ts` 对应 `src/views/editor/utils/reconcileFileContent.ts`
