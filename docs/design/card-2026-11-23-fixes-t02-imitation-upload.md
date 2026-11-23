# 卡：拆解仿写补文件选择——「隐藏 input+虚线 label」标准块第四例

以下命令均在项目根目录执行（相对路径）。

> 派卡前置：无。非禁入卡型（单组件+单测试，UI 静态控件复制），走 hy4。执行中读 >4KB 文件用 pointer 工具，禁整读。

## 根因/目标

owner 反馈「仿写档案（拆解仿写）依旧无上传按钮」。调研证实：`apps/web/src/pages/ImitationProfilesSection.tsx` 的「拆解新档案」表单只有粘贴 textarea（:163-170），**从未有任何文件选择控件**——同批 owner 反馈修好的其余 4 点位（NewBookPage.tsx:206-229、StyleProfilesSection.tsx:427-451、DistillProfilesShell.tsx:325-349、SettingsImportPanel.tsx:106-130）全部走「隐藏 input[type=file] + htmlFor label 虚线框 + FileReader → decodeTextFile（UTF-8/GBK）」纯前端方案（Tauri WebView2 原生可用，无需壳通道）。本卡=把该标准块补进仿写表单，完成全库上传点位销号（调研清单已确认其余点位无缺环）。计划真值=docs/plans/2026-11-23-three-feedbacks.md **任务 2**。

## 改动文件（卡外改动即超范围）

- Modify：`apps/web/src/pages/ImitationProfilesSection.tsx`（:170 textarea 闭合之后、:171「反推章数」label 之前插入标准块；文件头 import 区加 decodeTextFile）
- Test Modify：`apps/web/src/pages/ImitationProfilesSection.test.tsx` 追加

## 钉值

- 样板=StyleProfilesSection.tsx:427-451（先 pointer 读该段与文件头 import 行），同构复制仅换三处：`id="imitation-sample-file"`、`accept=".txt,.md"`、回填目标 `setText`（仿写样本 state）。
- onChange 语义：取 `e.target.files?.[0]`，FileReader `readAsArrayBuffer` → `decodeTextFile(new Uint8Array(res))` → `setText(解码结果)`；无文件不动。
- `import { decodeTextFile } from './NewBookPage';`（沿 StyleProfilesSection.tsx:10 先例；若该 import 形式在仿写文件产生 lint 环引用告警，停报不自行重构）。
- label 可见文案照抄其余点位：`点击选择本地 txt / md 文件（自动识别 UTF-8 / GBK 编码）`；虚线样式类名沿样板（border-dashed cursor-pointer 系）。
- 不动 analyze() 前置校验（:28-37）与其余渲染逻辑。

## 先红后绿

ImitationProfilesSection.test.tsx 新用例先写先红（形态参照 SettingsImportPanel.test.tsx 既有文件选择用例，先读该用例取 File 注入手法）：
- ① `document.querySelector('#imitation-sample-file')` 存在且 `accept` 含 `.md`；
- ② fireEvent.change 注入 File（文件名 `参考.md`，UTF-8 文本 ≥200 字中性内容）→ aria-label「仿写样本」textarea 的 value 包含注入内容；
- ③ 页面上存在文案「点击选择本地 txt / md 文件」的 label 且 htmlFor=`imitation-sample-file`。
实现转绿。既有用例断言不动。

## 验收命令

```bash
pnpm -F @inkforge/web exec vitest run src/pages/ImitationProfilesSection.test.tsx
pnpm -F @inkforge/web test
pnpm -F @inkforge/web build
pnpm typecheck
pnpm lint
```

全绿判据：定向绿；web 全量 **≥155 不减**（新用例净增）；build 冒烟过；typecheck 全 workspace 0 错；lint 零输出。

## 约束

- GUI 未验证（owner 真实测试）——提交信息必须注明，不得自行起浏览器目验。
- 不改 desktop/ 与 dist 同步（打包环节），卡外文件一律不动。
- 提交信息中文，`feat(web):` 前缀，正文 verify: 验证结果 + `Refs: DEC-2026-1123-01`；只 commit 不 push；永不 --no-verify；永不 git add -A，逐文件 add（含本卡面）。
- 现场冲突即停待裁决。
