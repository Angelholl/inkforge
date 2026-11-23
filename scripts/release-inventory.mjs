// CI 发版静态清点门（t07-S1）。用法: node scripts/release-inventory.mjs [--nsi <path>] [--log <path>]
// HAZARD: 以下 0.2.3 基线钉值来自当期生成 NSI，NSI 内容变更须重录（同 0.2.2 backlog），禁随手改数。
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';

const EXPECT_FILE_TOTAL = 3739;   // = MACRO 3736 + MAINBIN 1 + WEBVIEW2COND 2
const EXPECT_MACRO      = 3736;   // File 行含 "${INKFORGE_RES}
const EXPECT_MAINBIN    = 1;      // File "${MAINBINARYSRCPATH}"
const EXPECT_WEBVIEW2COND = 2;    // File /oname=$TEMP\...${WEBVIEW2BOOTSTRAPPERPATH|WEBVIEW2INSTALLERPATH}
const EXPECT_QUOTED_ABS = 6;      // 全文 /"[A-Z]:\\/g 命中数（仅 6 机器 define 行）
const EXPECT_TABLES     = 2;      // config\quality\ 两个 .default.txt 装载行
const EXPECT_FONTS_FILE = 1;      // dist\fonts 装载行
const EXPECT_FONTS_DELETE = 1;    // fonts 卸载行

const FAILED = [];
function check(name, ok, detail = '') {
  console.log(`CHECK ${name}: ${ok ? 'PASS' : 'FAIL'} ${detail}`.trimEnd());
  if (!ok) FAILED.push(`${name} ${detail}`.trimEnd());
}

// ---- 用法契约 / cwd 断言 ----
let nsiPath = 'apps/desktop/src-tauri/target/release/nsis/x64/installer.nsi';
let logPath = null;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--nsi' && argv[i + 1]) { nsiPath = argv[++i]; continue; }
  if (argv[i] === '--log' && argv[i + 1]) { logPath = argv[++i]; continue; }
  console.error(`BAD_ARG ${argv[i]}`);
  process.exit(2);
}
if (!existsSync('apps/desktop/src-tauri/tauri.conf.json')) {
  console.error('CWD_ASSERT_FAIL: cwd 非项目根');
  process.exit(9);
}

const nsi = readFileSync(nsiPath, 'latin1');
const lines = nsi.split(/\r?\n/);
const fileLines = lines.filter(l => l.trimStart().startsWith('File '));
const delLines = lines.filter(l => l.trimStart().startsWith('Delete '));
const fileText = fileLines.join('\n');

// I1 VERSION 门
const conf = JSON.parse(readFileSync('apps/desktop/src-tauri/tauri.conf.json', 'utf8').replace(/^\uFEFF/, ''));
const mVer = nsi.match(/^!define VERSION "(\d+\.\d+\.\d+)"$/m);
const nsiVersion = mVer ? mVer[1] : '(none)';
check('VERSION', !!mVer && nsiVersion === conf.version, `${nsiVersion} vs ${conf.version}`);

// I2 六机器行白名单（后缀形态，不限盘符/用户名）
const MACHINE_RES = [
  /^!addincludedir ".*target\\release\\nsis\\x64"$/m,
  /^!define INSTALLERICON ".*icons\\icon\.ico"$/m,
  /^!define UNINSTALLERICON ".*icons\\icon\.ico"$/m,
  /^!define INKFORGE_RES ".*src-tauri\\resources"$/m,
  /^!define MAINBINARYSRCPATH ".*target\\release\\inkforge-desktop\.exe"$/m,
  /^!define ADDITIONALPLUGINSPATH ".*tauri\\NSIS\\Plugins\\x86-unicode\\additional"$/m,
];
const machineHits = MACHINE_RES.map(re => (nsi.match(re) || []).length);
check('MACHINE_LINES', machineHits.every(n => n === 1), machineHits.join('/'));

// I3..I8 File 行形态分账（G8 口径：trimStart + 'File ' 带尾空格）
const isMacro = l => l.includes('"${INKFORGE_RES}');
const isMainbin = l => l.includes('"${MAINBINARYSRCPATH}"');
const isWebview2 = l => l.includes('${WEBVIEW2BOOTSTRAPPERPATH}') || l.includes('${WEBVIEW2INSTALLERPATH}');
const macro = fileLines.filter(isMacro).length;
const mainbin = fileLines.filter(isMainbin).length;
const webview2 = fileLines.filter(isWebview2).length;
const remainder = fileLines.filter(l => !isMacro(l) && !isMainbin(l) && !isWebview2(l)).length;
const absFile = fileLines.filter(l => /[A-Za-z]:\\/.test(l)).length;
const quotedAbs = (nsi.match(/"[A-Z]:\\/g) || []).length;
check('FILE_TOTAL', fileLines.length === EXPECT_FILE_TOTAL, String(fileLines.length));
check('MACRO', macro === EXPECT_MACRO, String(macro));
check('MAINBIN', mainbin === EXPECT_MAINBIN, String(mainbin));
check('WEBVIEW2COND', webview2 === EXPECT_WEBVIEW2COND, String(webview2));
check('REMAINDER', remainder === 0, String(remainder));
check('ABS_FILE', absFile === 0, String(absFile));
check('QUOTED_ABS', quotedAbs === EXPECT_QUOTED_ABS, String(quotedAbs));

// I10 迁移对 File/Delete 成对
const migExpected = readdirSync('apps/server/src/db/migrations').filter(n => /^0\d{3}_.*\.sql$/.test(n)).length;
const MIG_RE = /migrations\\0\d{3}_.*\.sql/;
const migFile = fileLines.filter(l => MIG_RE.test(l)).length;
const migDel = delLines.filter(l => MIG_RE.test(l)).length;
check('MIGRATIONS', migFile === migExpected && migDel === migExpected, `${migFile}/${migDel}`);

// I11 字体 + 词表
const fontsFile = fileLines.filter(l => /dist\\fonts/.test(l)).length;
const fontsDel = delLines.filter(l => /fonts/.test(l)).length;
const tables = fileLines.filter(l => /config\\quality\\(landing-words|cliches)\.default\.txt/.test(l)).length;
check('FONTS', fontsFile === EXPECT_FONTS_FILE && fontsDel === EXPECT_FONTS_DELETE, `${fontsFile}/${fontsDel}`);
check('TABLES', tables === EXPECT_TABLES, String(tables));

// I12① node_modules 顶层包覆盖（needle 算法照抄 scratch nm-coverage.mjs:8-12）
const tops = readdirSync('apps/desktop/src-tauri/resources/server/node_modules').filter(n => !n.startsWith('.'));
let missing = 0;
for (const t of tops) {
  const needle = 'node_modules\\' + t + (t.startsWith('@') ? '\\' : (t.endsWith('.dll') ? '' : '\\'));
  const alt = 'node_modules\\' + t + '"';
  const scoped = t.startsWith('@') ? 'node_modules\\' + t : needle;
  if (!nsi.includes(needle) && !nsi.includes(alt) && !nsi.includes(scoped)) { missing++; if (missing <= 8) console.log('MISSING', t); }
}
check('TOPS', missing === 0, `${tops.length} MISSING ${missing}`);

// I12② 个人面黑名单：作用域=全部 File 行拼接文本（不扩到 Delete 行，卸载语义非泄漏面）
const PERSONAL_RES = [
  /AppData\\Roaming/i, /\\\.inkforge\\/, /\\data\\/, /inkforge\.db/i,
  /landing-words\.txt/, /(^|[\\"/])config\.json/, /(^|[\\"/])\.env/,
];
let personal = 0;
for (const re of PERSONAL_RES) personal += (fileText.match(new RegExp(re.source, re.flags + 'g')) || []).length;
check('PERSONAL', personal === 0, String(personal));

// I12③ 无 abort：给了 --log 查完成标记；否则查版本对应的 bundle exe 结构在
if (logPath) {
  const logText = readFileSync(logPath, 'latin1');
  const v4 = logText.includes('Total size:');
  const tauri = logText.includes('Finished 1 bundle at:');
  const ok = !logText.includes('aborting creation') && (v4 || tauri);
  check(v4 ? 'NO_ABORT(/V4 log)' : 'NO_ABORT(tauri log)', ok,
        v4 ? 'Total size:' : (tauri ? 'Finished 1 bundle at:' : 'NO_COMPLETION_MARK'));
} else {
  const exe = `apps/desktop/src-tauri/target/release/bundle/nsis/inkforge_${nsiVersion}_x64-setup.exe`;
  const ok = existsSync(exe) && statSync(exe).size > 0;
  check('NO_ABORT(bundle exe)', ok, exe);
}

if (FAILED.length) {
  console.log('FAILED_CHECKS:');
  for (const f of FAILED) console.log(`  ${f}`);
  console.log('INVENTORY FAIL');
  process.exit(2);
}
console.log('INVENTORY PASS');
process.exit(0);
