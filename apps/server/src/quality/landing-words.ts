import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** 解析后的词表：h/l 两池 + 识别到的节头大写列表（含 H/L 与自定义节）。 */
export interface ParsedLandingWords {
  h: string[];
  l: string[];
  sections: string[];
}

export type LandingWordsValidation = { ok: true } | { ok: false; error: string };

/** 用户词表路径（DEC-2026-1122-02 A 案 / DEC-2026-1123-01，owner 呈批裁决「以普通用户为准」）：
 *  `INKFORGE_LANDING_WORDS_USER_PATH` env 优先（装机壳注入 cfg_dir，词表与库/config.json 同目录）、
 *  dev 兜底 `INKFORGE_DATA_DIR` 相对目录默认 `data`（cwd 解析沿 config.ts:87 同口径，落 apps/server/data 与库同仓）。
 *  DEC-2026-1123-01：dev 兜底改 dataDir 相对目录，旧 ~/.inkforge 文件 ensure 只拷不删迁移；装机壳注入 env 优先事实保留。 */
export function landingWordsUserPath(opts?: { home?: string; env?: string | undefined; dataDir?: string | undefined }): string {
  const env = opts?.env ?? process.env.INKFORGE_LANDING_WORDS_USER_PATH;
  if (env) return env;
  return path.resolve(opts?.dataDir ?? process.env.INKFORGE_DATA_DIR ?? 'data', 'landing-words.txt');
}

/** 旧 dev 词表迁移（DEC-2026-1123-01）：新位缺失且旧 ~/.inkforge 文件存在时只拷不删；
 *  全程吞错不抛，迁移失败不挡主流程；env 已设（装机壳注入/显式注入）则零迁移直接返回 env 路径。 */
export function ensureLandingWordsUserFile(opts?: { home?: string; env?: string | undefined; dataDir?: string | undefined }): string {
  const p = landingWordsUserPath(opts);
  const env = opts?.env ?? process.env.INKFORGE_LANDING_WORDS_USER_PATH;
  if (env) return p;
  try {
    const legacy = path.join(opts?.home ?? os.homedir(), '.inkforge', 'landing-words.txt');
    if (!fs.existsSync(p) && fs.existsSync(legacy) && legacy !== p) {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.copyFileSync(legacy, p);
    }
  } catch {
    /* 迁移失败不影响主流程（吞错不抛） */
  }
  return p;
}

/** 解析词表文本：split 容 CRLF；'' 与 '#' 开头跳过；`[X]` 节头切换当前节（未知节=识别入 sections 但不入池，
 *  沿装载器护栏 bb3a8f3）；词行在已知节内去重收集。语义镜像 l0.ts loadLandingWords，另抽 sections 供 API/UI。 */
export function parseLandingWordsText(text: string): ParsedLandingWords {
  const out: ParsedLandingWords = { h: [], l: [], sections: [] };
  let cur: 'h' | 'l' | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const t = raw.trim();
    if (t === '' || t.startsWith('#')) continue;
    const sec = /^\[([^\]]+)\]$/.exec(t);
    if (sec) {
      const name = sec[1].toUpperCase();
      cur = name === 'H' ? 'h' : name === 'L' ? 'l' : null;
      if (!out.sections.includes(name)) out.sections.push(name);
      continue;
    }
    if (cur !== null && !out[cur].includes(t)) out[cur].push(t);
  }
  return out;
}

/** 词表文本校验（PUT 用，R4：不设节头枚举白名单——未知节本就是装载器护栏语义）：≤8KB + 节头行格式合法。 */
export function validateLandingWordsText(text: string): LandingWordsValidation {
  if (Buffer.byteLength(text, 'utf8') > 8192) return { ok: false, error: '词表超过 8KB 上限' };
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith('[') && !/^\[[^\]]+\]$/.test(t)) {
      return { ok: false, error: `第 ${i + 1} 行节头格式非法（应为 [X] 形态，如 [H]/[L]/[调情]）` };
    }
  }
  return { ok: true };
}

/** 读用户词表文件；缺失/不可读→''（容错不抛，沿 readSettingsFile 先例）。 */
export function readLandingWordsUserFile(p: string = landingWordsUserPath()): string {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return '';
  }
}

/** 原子写用户词表文件：先 mkdir 再 `<p>.tmp`+rename（沿 writeSettingsFile :45-50 先例）。 */
export function writeLandingWordsUserFile(text: string, p: string = landingWordsUserPath()): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, p);
}

const DEFAULT_LANDING_WORDS_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../config/quality/landing-words.default.txt',
);

/** 词表路径解析（DEC-2026-1122-02）：① 用户文件存在 > ② INKFORGE_LANDING_WORDS_PATH env（存在性判定，
 *  env 指向缺失→回落默认，防锁死空表）> ③ 仓库默认。按 run 调用（chapter.ts 管线每章装载）→
 *  PUT 写用户文件后下一次生成 run 生效，进行中 run 不受影响。 */
export function resolveLandingWordsPath(opts?: {
  home?: string;
  env?: string | undefined;
  userEnv?: string | undefined;
  dataDir?: string | undefined;
}): string {
  const userPath = ensureLandingWordsUserFile({ home: opts?.home, env: opts?.userEnv ?? process.env.INKFORGE_LANDING_WORDS_USER_PATH, dataDir: opts?.dataDir });
  if (fs.existsSync(userPath)) return userPath;
  const env = opts?.env ?? process.env.INKFORGE_LANDING_WORDS_PATH;
  if (env && fs.existsSync(env)) return env;
  return DEFAULT_LANDING_WORDS_PATH;
}
