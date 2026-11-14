# GUI 黑盒目验：删书模块（0.2 书架删除，2026-11-15）

**环境：** 8789 mock 隔离实例（四件套齐备：INKFORGE_PORT=8789 + INKFORGE_DATA_DIR=data/gui-verify-booksdel + INKFORGE_MOCK=1 + INKFORGE_CONFIG_FILE=data/gui-verify-booksdel/config.json + STRATA_* 占位），web 经 vite dev（5173）+ INKFORGE_API_TARGET=http://127.0.0.1:8789 代理（dev 代理为先例方案）。驱动：puppeteer-core + 系统 Chrome（无头），纯真实用户操作（导航/点击），零 JS 注入改状态；只读 GET 作服务端交叉复核。8787 生产态零触碰。

**结论：全部测试点 PASS（首跑发现目验脚本定位器缺陷，修正后重跑；应用侧零缺陷）**

| # | 测试点 | 结果 | 证据 |
|---|---|---|---|
| P0-1 | 书架初始加载：两本书（GUI-KEEP-B / GUI-DEL-A）各带删除按钮，布局无爆版 | PASS | t1_initial.png |
| P0-2 | 点「删除」→ 仅目标行内出现确认条（红色警示「章节/人物/运行记录一并清除，不可恢复」+ 确认删除 + 取消），不立即删 | PASS | t2_confirm_bar.png |
| P0-3 | 点「取消」→ 确认条消失、行保留 | PASS | t3_cancelled.png |
| P0-4 | 再删 →「确认删除」→ 行消失 + 服务端 GET /api/books 复核仅剩 GUI-KEEP-B | PASS | t4_deleted.png / t5_final.png |

**console 错误清单：** 零（无未捕获异常、无渲染报错、无请求失败）。

## 环境准备记录（与测试行为区分）

- 两本书由 API 预置（中文标题经 curl 曾出现编码噪声，重建为 ASCII 标题）；删除行为本身全部由 GUI 操作产生；
- 首跑脚本缺陷：多行书架下 `button` 全局首个匹配命中另一行的删除钮（误删 GUI-KEEP-B——该删除流程本身完整走通，反向佐证功能正常）；修正为行作用域定位（先锁标题所在 `li` 再点行内按钮）后重跑全绿。

## 环境事故记录（非应用缺陷）

1. 8789 被上一会话遗留的 0.1.2 dev 实例（PID 59220，11-14 WCO 目验残留）占用且呈「无 LISTEN 状态却应答」幻象（lessons L-20261015-05 同型），已终止后重起；
2. 隔离 server 直启需补 STRATA_* 占位（dev 脚本靠 .env 提供，config schema 必填）；
3. 隔离实例清理须含 worker 子进程（index.ts 自动拉起独立 worker，符合 DEC-2026-1113-04 M7 架构红线）。

## 回归账本

shared 2 / web 23 / server 190 = **215**（211→215：server +3 books-delete、web +1 删书两步确认）；lint/typecheck 全绿。
