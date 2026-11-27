# card-2026-11-27-roster-nonexclusive — 补摘要名册注入改非排他＋名册含别名

Refs: DEC-2026-1127-03（owner 拍板 A 案）。本卡自足封闭，按四条执行。

## 一、根因

11-27 批 Q1 名册注入文案（commit 5ad05b2）系排他禁止性表述「只可使用下列名字，名册外新名字一律不写入 STATE」：模型遇到名册外人物（未建档/已下线/用别名）即自我抑制不写 STATE，导致补摘要弹窗人物区大面积变空；上一版无此约束可自由列出全部出场人物。叠加 `collectSummarizeContext` 名册只列 `name` 不含 aliases，而落库匹配序（133279d）支持 alias 命中——该分支被 prompt 层掐死成死代码。解析器/DTO/弹窗接线完好，本卡不动。

## 二、改动文件与改法（仅此两 src 文件＋测试文件，其余零改动）

1. `apps/server/src/prompts/render.ts:153` — 名册块标题行整行替换为钉死文案：
   `【已知角色名册】（STATE 优先使用下列名字，括号内别名同样可用；名册遗漏的本章出场人物照常写入 STATE，落库时逐行裁决）`
   伏笔块标题行「只可指向下列条目」逐字保留不动。
2. `apps/server/src/pipeline/summarize.ts` — `collectSummarizeContext`（约 :28）名册生成改展平 name+aliases：有别名的人物 → `张三（别名：小三、张先生）`（多别名顿号分隔），无别名 → 裸名。`renderSummarize` 签名不变（roster 仍 string[]，条目照旧输出 `- ${entry}`）。SUMMARIZE_ROSTER_CAP=50 计数口径按人物数不变。

## 三、先红后绿回归测试（server 基线 706 只增不减）

1. `apps/server/test/prompts/contract.test.ts` 新增用例「renderSummarize 名册非排他文案」：roster 传非空时输出须含 `优先使用`、不得含 `一律不写入`；条目行传 `- 张三（别名：小三）` 须原样出现。
2. `apps/server/test/pipeline/summarize.test.ts` 新增 `collectSummarizeContext` 用例：种子人物卡 name=`赵九` aliases=["小赵"]，断言 roster 含 `赵九（别名：小赵）`；另种一无别名裸名人物，断言其行为裸名。
3. 跑测试前全库 grep「只可使用下列名字|一律不写入」（apps/**/src+test）——主审已核当前仅 render.ts:153 一处命中；执行中若发现测试另有钉死命中即停报，不得自改。

## 四、验收命令（以下命令均在项目根目录执行）

- `pnpm -C apps/server typecheck` → 零错
- `pnpm -C apps/server test` → 全绿 ≥708（基线 706＋本卡新增用例，只增不减）
- lint 按项目工具链配置跑 → 零错

## 五、约束

- 只 commit 不 push；提交信息=Conventional 前缀＋中文描述，正文含 verify: 验证结果 + Refs: DEC-2026-1127-03。
- 永不 --no-verify；永不 git add -A（显式列卡面文件）。
- 测试库隔离，不连主库 apps/server/data/；输出禁引 H 书原文。
- GUI 未验证（无前端改动）。
- 卡外问题即停待裁决。
