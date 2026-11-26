# 执行卡 OB-T3：characters 槽护栏（DEC-2026-1126-08）

前置＝OB-T1、OB-T2 已验收合入（三卡同改 chapter.ts，串行）。

## 一、根因
事故章注入的 6 张人物卡全是设定集群像原型卡，在本书第 1–6 章正文零出现；真正登场的主角/女主/情夫无卡。draft 把偷情双方写成卡上人名、卡片外形细节原样入文（L1 blocker 抓到）。owner 拍板：characters 槽只注入本章蓝图涉及人物；缺卡检测不做中文人名抽取，复用 L1「人物一致」blocker 通道（事故中已抓到），本卡只修注入侧。

## 二、改动文件与改法
计划真值源=docs/plans/2026-11-26-output-budget-stitch.md 任务 T3（按指针工具读取；卡面与计划只作执行用途，输出与提交正文不得原文摘抄其中引文）。
1. Create `apps/server/src/pipeline/roster.ts`：纯函数 `filterRosterForChapter(cards: CharacterCard[], blueprintText: string): { cards: CharacterCard[]; warning?: string }`——卡 name 出现在蓝图 JSON 全文（goal/beats/mustHaveBeats 拼串）才保留；**零命中→全量注入并记 warning「蓝图未匹配任何人物卡，已全量注入」**（防抽空保险丝）。CharacterCard 类型以 booksRepo.listActiveCharacters 现行返回形状为准。
2. Modify `apps/server/src/pipeline/chapter.ts:226-229`：renderCharacterCards 入参换为过滤结果；warning push 进 draft 步 run_steps.output_json（自由 JSON，无新 shared 类型、无迁移）。

## 三、先红后绿回归测试
- R-T3-1 roster.test.ts：①fixture=六张群像卡＋蓝图全文零命中→全量＋warning 存在；②蓝图点名某卡人物（如「赵启帆」）→仅注入该卡、无 warning；③空蓝图 JSON→全量无 warning。
- R-T3-2 chapter.test.ts 管线用例补一条：零命中场景下 characters 槽仍含全部卡且 draft output_json.warnings 有字符串。

## 四、验收命令（以下命令均在项目根目录执行）
1. `pnpm typecheck && pnpm lint` → 零告警。
2. `pnpm --filter @inkforge/server test -- test/pipeline/roster.test.ts test/pipeline/chapter.test.ts` 全绿。
3. `pnpm --filter @inkforge/server test` 全量 ≥647（T1+5、T2+4 后基线＋本卡 +4，只增不减）。

## 五、约束
禁改：listActiveCharacters 仓库层形状、0009 下线过滤逻辑（chapter.ts:227 注释行）、renderCharacterCards 本体、shared 包类型。**不连主库查数据**——测试自持夹具，勿把库内正文带进输出流（本项目成人内容会触发通道过滤器）。每卡一次提交只 commit 不 push，Conventional 前缀＋中文正文含 `verify:` 与 `Refs: DEC-2026-1126-08`；永不 --no-verify / -A。卡外问题即停回报。
