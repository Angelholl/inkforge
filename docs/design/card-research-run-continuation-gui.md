# 调研卡：续写 run 的 GUI 交互路径（运行卡展示/调整入口/内容查看）

## ① 调研问题与范围

背景：owner 实测反馈——在 GUI 发起续写后看到提示「续写已入队 run 438b3337，进度见右侧「运行」卡」，但（a）续写开始后无「调整选择」入口（无法取消/终止/调整参数），（b）无法直接查看续写生成的内容。需查明这是「功能未实现」「实现但入口缺失/被 UI 重塑弄丢」还是「存在但不可达」。

范围：apps/web（前端）+ apps/server（后端）+ packages/shared（共享类型）。

调研问题（逐条回答）：
1. 文案锚点「续写已入队」「进度见右侧」（或近似文案）在哪个组件渲染？给出 path:line。
2. 右侧「运行」卡的组件是哪个文件？入队后/运行中/完成后/失败各状态分别展示什么（状态文案、进度、按钮）？列出该组件全部可交互元素。
3. run 生命周期：前端对 run 有哪些操作 API（取消/中止/重试/删除等）？后端是否实现了对应路由（搜 cancel/abort/stop/retry 与 run 路由）？前端是否调用了？
4. 续写完成后，生成内容落盘到哪里（数据流：run 完成→内容写在哪→GUI 哪个页面/组件可看到）？「运行」卡上是否有点击进入/展开内容的入口？书详情页与 run 结果的关联展示？
5. 近期 UI 重塑是否动过这些代码：`git log --oneline -20` 与 `git show --stat` 查 b106878、4095e8d、d5a5842 中涉 run/运行/续写相关组件的变更，若有则摘录关键 diff 行。

文案锚点（多重冗余）：「续写已入队」「进度见右侧」「运行」；中文 UI，可能在 apps/web/src 下组件或常量文件。若精确文案搜不到，试搜「入队」「续写」「运行」及 run/queue/continuation 英文标识。

## ② 只读约束

禁止改动工作树任何代码文件（含测试与配置）。产出报告落盘 docs/design/research-run-continuation-gui.md。git 只读命令（log/show/grep）允许。

## ③ 报告结构

结论先行（每个调研问题一段直接结论）→ 证据（path:line + 关键代码摘录，每段摘录 ≤15 行）→ 未找到项与已试搜索词（逐条列出）。

## ④ 验收命令

以下命令均在项目根目录执行（主审可独立复核）：
- `grep -rn "续写已入队\|进度见右侧" apps/web/src --include="*.ts*" | head -20`
- `grep -rln "run" apps/web/src --include="*.tsx" | head -30`（运行卡组件应在此列）
- `grep -rn "cancel\|abort\|retry" apps/server/src --include="*.ts" -i | grep -i run | head -20`
- 报告文件存在且四问题各有结论：`ls docs/design/research-run-continuation-gui.md`

## 约束

- 卡面自足，不依赖会话上下文。
- 指针令：执行中读取大于 4KB 的文件，用 `python C:/Users/57850/.zcode/tools/pointer_tools.py` 的 pointerize/read_pointer 按段读，禁止整读文件全文。
- 只 commit 不 push；报告文件计入提交。
