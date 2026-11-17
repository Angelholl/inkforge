import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * token 对比度回归门（DEC-2026-1118-02 评议员验证建议采纳）：
 * 直接读 index.css 的 @theme 值，纯函数算 WCAG 对比度——改 token 触线即红，
 * 防止「换色换出不可见」。阈值：正文 4.5、控件边界 3、焦点/徽标 4.5。
 * faint 不设门槛（装饰层，不承载必读信息，规格 §2.6/评议员 R1 一致口径）。
 */

type Tokens = Record<string, string>;

function parseThemeTokens(css: string): Tokens {
  const m = css.match(/@theme\s*\{([\s\S]*?)\n\}/);
  if (!m) throw new Error('index.css 缺 @theme 块');
  const out: Tokens = {};
  for (const line of m[1].split('\n')) {
    const t = line.match(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/);
    if (t) out[t[1]!] = t[2]!;
  }
  return out;
}

function luminance(hex: string): number {
  const c = hex
    .slice(1)
    .match(/[0-9a-f]{2}/gi)!
    .map((h) => parseInt(h, 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

export function contrast(fg: string, bg: string): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

const css = readFileSync(join(__dirname, '..', 'index.css'), 'utf-8');
const t = parseThemeTokens(css);

function expectRatio(fgKey: string, bgKey: string, min: number): void {
  const fg = t[fgKey];
  const bg = t[bgKey];
  if (!fg || !bg) throw new Error(`token 缺失: ${fgKey}=${fg} ${bgKey}=${bg}`);
  expect(contrast(fg, bg), `${fgKey}/${bgKey}`).toBeGreaterThanOrEqual(min);
}

describe('松烟 token 对比度门（DEC-2026-1118-02）', () => {
  it('正文/次要文字达标（4.5/7）', () => {
    expectRatio('color-ink', 'color-bg', 7);
    expectRatio('color-ink', 'color-surface', 7);
    expectRatio('color-muted', 'color-bg', 4.5);
    expectRatio('color-muted', 'color-surface', 4.5);
  });

  it('控件边界可达 3:1（评议员 HIGH_RISK 修正）', () => {
    expectRatio('color-line-control', 'color-surface', 3);
    expectRatio('color-line-control', 'color-bg', 3);
  });

  it('状态徽标文字对软底 ≥4.5', () => {
    expectRatio('color-ok', 'color-ok-soft', 4.5);
    expectRatio('color-warn', 'color-warn-soft', 4.5);
    expectRatio('color-danger', 'color-danger-soft', 4.5);
    expectRatio('color-accent-strong', 'color-accent-soft', 4.5);
    expectRatio('color-primary-strong', 'color-primary-soft', 4.5);
  });

  it('炉膛控制台可读（常规 ≥4.5，次要 ≥3）', () => {
    expectRatio('color-console-1', 'color-console-bg', 4.5);
    expectRatio('color-console-2', 'color-console-bg', 3);
    expectRatio('color-console-5', 'color-console-bg', 4.5);
    expectRatio('color-console-3', 'color-console-bg', 3);
    expectRatio('color-console-4', 'color-console-bg', 3);
  });
});
