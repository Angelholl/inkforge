// nsi stamp 脚本（0.2-T13/T14，DEC-2026-1113-05 M1/M10 / DEC-2026-1123-02）：
// VERSION/VERSIONWITHBUILD/INSTALLERICON/UNINSTALLERICON/INKFORGE_RES/MAINBINARYSRCPATH/ADDITIONALPLUGINSPATH/!addincludedir
// 默认（无 INKFORGE_STAMP_NSI=1）no-op 退出 0 不落盘；开关开启时就地改写上述行；
// --out <path> 模式不改原文件，落一份盖章副本（T14 芽构建用，可与 --version 连用）。
// 与 cwd 无关：全部路径以 import.meta.url 相对解析。任一定位失败/多命中 → exit 1 不落盘；幂等。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const nsiPath = resolve(here, '../src-tauri/nsis/inkforge-installer.nsi');
const confPath = resolve(here, '../src-tauri/tauri.conf.json');

const args = process.argv.slice(2);
function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}
const outPath = argValue('--out');
const versionArg = argValue('--version');
const productNameArg = argValue('--product-name');
const stampEnabled = process.env.INKFORGE_STAMP_NSI === '1';

if (!stampEnabled && !outPath) {
  // no-op：默认不落盘，不触 nsi
  process.exit(0);
}

let version = versionArg;
if (!version) {
  const conf = JSON.parse(readFileSync(confPath, 'utf8'));
  version = conf.version;
}
if (!version || !/^\d+\.\d+\.\d+/.test(version)) {
  console.error('stamp: 无法确定版本（--version 或 tauri.conf.json version）');
  process.exit(1);
}

function replaceLine(text, prefix, newValue, label) {
  // 恰一行命中；0 或多命中即失败
  const re = new RegExp(`^${prefix} .*$`, 'm');
  const hits = text.match(new RegExp(`^${prefix} .*$`, 'gm')) ?? [];
  if (hits.length !== 1) {
    console.error(`stamp: ${label} 定位失败（命中 ${hits.length} 行）`);
    process.exit(1);
  }
  return text.replace(re, `${prefix} "${newValue}"`);
}

const original = readFileSync(nsiPath, 'utf8');
let stamped = original;
stamped = replaceLine(stamped, '!define VERSION', version, 'VERSION');
// VERSIONWITHBUILD 须满足 VIProductVersion X.X.X.X：取纯数字段补 .0（0.2.0-dev → 0.2.0.0）
const [numericVersion] = version.split('-');
const versionWithBuild = `${numericVersion}.0`;
stamped = replaceLine(stamped, '!define VERSIONWITHBUILD', versionWithBuild, 'VERSIONWITHBUILD');
// PRODUCTNAME 决定 ARP 键名与默认安装目录：芽构建必须与主安装「墨炉」隔离（T14 实测 tauri 不替换模板字面量）
if (productNameArg) {
  stamped = replaceLine(stamped, '!define PRODUCTNAME', productNameArg, 'PRODUCTNAME');
}
stamped = replaceLine(stamped, '!define INSTALLERICON', resolve(here, '../src-tauri/icons/icon.ico'), 'INSTALLERICON');
stamped = replaceLine(stamped, '!define UNINSTALLERICON', resolve(here, '../src-tauri/icons/icon.ico'), 'UNINSTALLERICON');
// 以下三条机器路径 define：全部由脚本自身位置与本机 env 计算，源码无盘符字面量（DEC-2026-1123-02 裁决②）
stamped = replaceLine(stamped, '!define INKFORGE_RES', resolve(here, '../src-tauri/resources'), 'INKFORGE_RES');
stamped = replaceLine(stamped, '!define MAINBINARYSRCPATH', resolve(here, '../src-tauri/target/release/inkforge-desktop.exe'), 'MAINBINARYSRCPATH');
// ADDITIONALPLUGINSPATH 由 LOCALAPPDATA 计算；缺失即中止，不落盘
const localAppData = process.env.LOCALAPPDATA;
if (!localAppData) {
  console.error('stamp: LOCALAPPDATA 缺失，无法定位 ADDITIONALPLUGINSPATH');
  process.exit(1);
}
stamped = replaceLine(stamped, '!define ADDITIONALPLUGINSPATH', `${localAppData}\\tauri\\NSIS\\Plugins\\x86-unicode\\additional`, 'ADDITIONALPLUGINSPATH');
// 模板头 build-aid include 目录同样机器相对（直编模板时引 tauri 生成件的 include——DEC-2026-1123-02 主审补列）
stamped = replaceLine(stamped, '!addincludedir', resolve(here, '../src-tauri/target/release/nsis/x64'), 'ADDINCLUDEDIR');

if (outPath) {
  mkdirSync(dirname(resolve(outPath)), { recursive: true });
  writeFileSync(resolve(outPath), stamped, 'utf8');
  console.log(`stamp: 副本已落 ${resolve(outPath)}（version=${version}）`);
} else {
  writeFileSync(nsiPath, stamped, 'utf8');
  console.log(`stamp: 就地盖章 ${nsiPath}（version=${version}）`);
}
