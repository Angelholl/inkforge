# 执行卡 BR-6：蓝图散文直输·web

## 一、根因
owner 反馈二现场：蓝图卡片大文本框直输纯中文散文→点「基于已有草稿扩展」→红字「当前蓝图草稿不是合法 JSON，无法作为扩展种子」被拒。拍板 D4=直接接受并 AI 扩写（server 侧 BR-5 已落）。

## 二、改动文件与改法
计划真值源=docs/plans/2026-11-26-bind-relocation-prose-draft.md §3.5 web 段（字面量逐条钉死，按指针工具读取）。只改 `apps/web/src/pages/BookDetailPage.tsx` suggest()(:460-482)：
1. 入口空守卫：`const raw = blueprintText.trim(); if (raw === '') { setMsg('蓝图草稿为空：请先填写蓝图 JSON 或章节草稿文字'); return; }`
2. JSON.parse 成功→现有 seed 路逐字不动。
3. 失败 catch 分支→`body = { chapterNo, draftText: blueprintText };`（原文非 trim 副本）+本地标记 proseMode=true。
4. 成功回填后消息分叉：proseMode ? `已按散文草稿扩写为第 ${chapterNo} 章蓝图，可编辑后点「保存蓝图」` : 原消息逐字保留。
5. :468 红字文案与 return 一并删除（全库无测试钉它，grep「合法 JSON」仅此前一处命中）。
按钮区 :1113-1118 与 api.suggestBlueprint 调用形态零改动。

## 三、先红后绿回归测试
- R-BR6-1 `it('BR：直输中文散文点「基于已有草稿扩展」→ 发 draftText 不发 seed，回填蓝图+扩写消息')`：textarea 输入纯中文→POST body {chapterNo,draftText} 且 seed undefined→stub 回蓝图→textarea 变 JSON、消息含「已按散文草稿扩写」。
- R-BR6-2 `it('BR：空草稿点扩展 → 就地提示不发请求')`：置空→/blueprint-suggest 调用数不增+getByText(/蓝图草稿为空/)。

## 四、验收命令（以下命令均在项目根目录执行）
1. `pnpm --filter @inkforge/web test -- BookDetailPage.test.tsx` → 全绿含新 2 例；**R-F4-3 :411-435 逐字不动仍绿（本步禁改该例）**。
2. `grep -n "合法 JSON" apps/web/src/pages/BookDetailPage.tsx` → 零命中。
3. `grep -n "useSeed: true" apps/web/src/pages/BookDetailPage.tsx` → 仅「基于已有草稿扩展」按钮 1 处。

## 五、约束
禁改：默认「AI 建议蓝图」按钮不传 seed/draftText 语义（DEC-2026-1125-03 R-F4-3）、R-F4-3 用例、StyleBindPanel/绑定条区（BR-2 已落，零触碰）。每卡一次提交只 commit 不 push，`verify:`+`Refs:` 尾注；永不 --no-verify/-A。卡外问题即停回报。
