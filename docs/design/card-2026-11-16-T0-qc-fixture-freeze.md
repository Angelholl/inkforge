# 卡 T0：qc 回归夹具自固化（去活库依赖，修 server 基线 2 红）

## 一、根因

server 全量测试存在 2 个存量红：`qc-replay.test.ts` / `qc-regression.test.ts` 的 `draftFor` 直连运行时库 `apps/server/data/inkforge.db` 读语料书 `1130c0e1-dddd-47d6-8b28-86e0dd558cce` 的 5/8/12 章 current 版本正文。该书已被开发库重建删除（现库仅剩 `48a22171`「33」），查询行 undefined 抛 `TypeError`。当初只固化了模型 raw 夹具、未固化 draft 正文，测试因此耦合开发机 DB 状态（`docs/design/card-gui-launcher.md:60` 已登记为存量红）。修法=把三章 draft 正文固化为仓库内夹具文件，`draftFor` 改读夹具，彻底去活库依赖。

## 二、改动文件（仅此五件，不得越界）

- Create `apps/server/test/quality/regression/real/draft-005.txt`、`draft-008.txt`、`draft-012.txt`
- Modify `apps/server/test/quality/regression/qc-replay.test.ts`（import 区 :1、常量 :11-12、draftFor :19-32）
- Modify `apps/server/test/quality/regression/qc-regression.test.ts`（import :1 与 :6、draftFor :14-27）
- Modify `apps/server/test/quality/regression/corpus.ts`（删导出 :27 `DB_PATH`、:28 `BOOK_ID`）

计划真值 = `docs/plans/2026-11-16-four-feedbacks.md` Task0（:27-49）；与卡面冲突即停报，不得自行折中。

## 三、改法（钉死）

1. **夹具生成**（源 md 单文件 >4KB，禁止整读，用脚本逐字节导出；cwd=仓库根）：

```bash
python -I - <<'PY'
src='apps/server/data/exports/挂机-试炼之路-1112基线/'
dst='apps/server/test/quality/regression/real/'
good={5:'001',8:'002',12:'003'}
for ch in (5,8,12):
    body=open(src+f'{ch:03d}-第{ch}层.md',encoding='utf-8').read().split('\n',1)[1].lstrip('\n')
    hdr=('<!-- 来源：apps/server/data/exports/挂机-试炼之路-1112基线/'+f'{ch:03d}-第{ch}层.md'+
         '（去首行标题逐字节拷贝）；QUOTE 全命中核对 2026-11-16 -->\n'
         '<!-- 回放契约：real/l1-good-'+good[ch]+'.txt 的每条 QUOTE 须为本文件正文子串；本文件系 draftFor 数据源 -->\n')
    open(dst+f'draft-{ch:03d}.txt','w',encoding='utf-8',newline='\n').write(hdr+body)
    print(ch,len(body))
PY
```

期望打印 `5 3635` / `8 3682` / `12 3030`（主审 2026-11-16 实测正文长度）。任一不符即停报，不得继续。

2. **自证门**（夹具落地后立即跑，missing 非 0 不得继续）：

```bash
python -I - <<'PY'
import re
d='apps/server/test/quality/regression/real/'
for i,ch in enumerate([5,8,12],1):
    g=open(d+f'l1-good-00{i}.txt',encoding='utf-8').read()
    dr=open(d+f'draft-{ch:03d}.txt',encoding='utf-8').read()
    q=re.findall(r'^QUOTE:\s*(.+)$',g,re.M)
    print(ch,'quotes',len(q),'missing',sum(1 for x in q if x not in dr))
PY
```

期望 `5 quotes 3 missing 0` / `8 quotes 4 missing 0` / `12 quotes 4 missing 0`。

3. **draftFor 改造**（两测试文件同款，签名不变）：函数体改
`return readFileSync(path.join(REAL_DIR, \`draft-00${chapterNo}.txt\`), 'utf8');`
   - `qc-replay.test.ts`：删 :1 `import Database from 'better-sqlite3'`；删本地常量 `DB_PATH`（:11）与 `BOOK_ID`（:12）；保留 `HERE`/`REAL_DIR`/`CAPTURE_CHAPTERS`/`readFixture`；补 `readFileSync` 已有（:2）。
   - `qc-regression.test.ts`：删 :1 `import Database from 'better-sqlite3'`；:6 的 corpus import 去掉 `BOOK_ID`、`DB_PATH` 两项，增引 `REAL_DIR`；增 `import { readFileSync } from 'node:fs';`。
   - `corpus.ts`：删 :27 `export const DB_PATH`、:28 `export const BOOK_ID`；`REAL_DIR`/`CAPTURE_CHAPTERS` 保留。
   - 三文件删净后不得残留未用 import/未用导出（lint 会抓）。

## 四、先红后绿回归测试（以下命令均在项目根目录执行）

1. 先红登记：`pnpm --filter @inkforge/server exec vitest run test/quality/regression` → 2 failed（`current_version_id` TypeError）。
2. 按三、执行后复跑同命令 → 该目录全绿、无新红。
3. `grep -rn "inkforge.db\|better-sqlite3" apps/server/test/quality/regression/ --include=*.ts` → 0 命中。
4. `pnpm typecheck` → 0 错；`pnpm lint` → 0 错。
5. `pnpm --filter @inkforge/server exec vitest run` → **231 用例全绿**（用例数不变，2 红转绿；server 基线自此钉 231 全绿）。

## 五、验收命令（主审独立复核）

- 四、2/3/5 命令重跑绿；`git show --name-status HEAD` 仅触及二、清单五文件、无 `data/` 下新增。
- 夹具忠实度抽查（主审另跑，三章逐字节等值须全 True）：

```bash
python -I - <<'PY'
src='apps/server/data/exports/挂机-试炼之路-1112基线/'
dst='apps/server/test/quality/regression/real/'
for ch in (5,8,12):
    s=open(src+f'{ch:03d}-第{ch}层.md',encoding='utf-8').read().split('\n',1)[1].lstrip('\n')
    d=open(dst+f'draft-{ch:03d}.txt',encoding='utf-8').read().split('\n',2)[2]
    print(ch, s==d)
PY
```

## 六、约束

- 禁改：`apps/server/src/**`、`packages/**`、`apps/web/**`、任何 `package.json`、`test/quality/regression/` 之外的测试文件；`real/` 目录只准新增 3 个 `draft-*.txt`。
- 禁碰运行时数据：`apps/server/data/inkforge.db`、`apps/server/data/backups/**`（服务在跑，`service.pid`/`worker.lock` 在场）；不得起停服务、不得占用 8787 端口；`apps/server/data/exports/**` 只读。
- 只 commit 不 push；`git add` 明确列五文件路径，永不 `git add -A`、永不 `--no-verify`。
- commit 标题：`test(server): qc 回归夹具自固化，去活库依赖`；正文 `verify:` 行须含三夹具字节数、QUOTE 命中数（3/4/4，missing=0）、定向与全量结果（231 全绿）、typecheck/lint 结果；尾行 `Refs: DEC-2026-1116-01`。GUI 未触及。
- 卡外问题即停报，不得自行扩面。
