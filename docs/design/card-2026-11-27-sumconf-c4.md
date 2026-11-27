# C4 卡面：弹窗第五段「未匹配处理」+ 前端重名预检

**真值源：** docs/plans/2026-11-27-summary-unmatched-confirm.md「任务 T4」节——`unmatched` 必填 props 三数组签名、段五 UI 钉死值（含 :168 **默认处置=人物新建卡/伏笔写入**，owner 拍板决策点③）、重名预检文案逐字、5 测试用例名全部照计划执行。
**指针令：** 执行中读取大于 4KB 的文件或查看改动，用 `python C:/Users/57850/.zcode/tools/pointer_tools.py` 的 pointerize/read_pointer/read_diff_only，禁止整读文件全文。

## 根因
owner 反馈①②③：未匹配条目不得静默忽略、改名人物三态裁决、落库前批量确认——现弹窗四段结构下未匹配行只有标注文案无处置控件（勾选了也会被后端丢）。本卡加第五段逐条裁决 UI + 前端重名预检（评议 HIGH_RISK 采纳件）；页面接线归 C5。

## 改动文件（写集，测试随卡）
- Modify `apps/web/src/components/SummaryConfirmDialog.tsx`：props 追加必填 `unmatched: { characters, threads, cards }`；段五位于段四与 error/footer 之间，标题「未匹配处理」；人物行三态 select（默认新建卡）、伏笔行两态 select（默认写入）；关联目标下拉默认第一张卡、cards 空时该选项 disabled；段三/段四中未匹配行去 checkbox 原位仅留标注文案；buildBody 组装两裁决数组、未匹配行 include 恒 false；重名预检拦 onConfirmed 落既有 error 槽（文案逐字照计划）；open/换稿 useEffect 复位含两 state map
- Test `apps/web/src/components/SummaryConfirmDialog.test.tsx`：+5 例（用例名照计划逐字，首条=「段五渲染：人物三态下拉默认新建卡、伏笔两态下拉默认写入」）；既有共享 render 助手补传空三数组一处

## 先红后绿回归测试
计划 T4 步骤串执行留痕；既有 7 例零改动跑绿（钉死文案常量 :12-14 不动）。

## 验收命令（以下命令均在项目根目录执行）
1. `pnpm --filter @inkforge/web exec vitest run src/components/SummaryConfirmDialog.test.tsx` → 全绿含新增五例
2. web 全量只增不减（开卡前实测基线存证，最近台账值 222）；`pnpm -w typecheck` 零错；lint 零错后 commit

## 约束
- 前置 C0 已验收合入方可开工。GUI 黑盒归主审批次收口统一做（本卡提交信息注明「GUI 未验证」）。
- 只 commit 不 push；禁 `git add -A`、禁 `--no-verify`；Conventional 前缀+中文描述，正文 verify:+`Refs: DEC-2026-1127-02`。
- 写集外零改动；卡外问题即停待裁决，非交互禁提问。
- 【防过滤器】不连主库；输出与提交信息禁引小说原文片段（测试夹具假名可用）；files_touched 契约必须非空。
