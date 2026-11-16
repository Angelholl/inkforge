import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseFindings } from '../../../src/llm/plainproto';

/** D1 真模型 raw replay 回归（T-C3，DEC-2026-1113-01）：夹具=Strata 对同章 draft 输入的重采样 raw，原样入库禁修剪。 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REAL_DIR = path.join(HERE, 'real');
const CAPTURE_CHAPTERS = [5, 8, 12] as const;

function readFixture(name: string): string {
  return readFileSync(path.join(REAL_DIR, name), 'utf8');
}

function draftFor(chapterNo: number): string {
  return readFileSync(path.join(REAL_DIR, `draft-${String(chapterNo).padStart(3, '0')}.txt`), 'utf8');
}

describe('D1 真模型 raw replay 回归', () => {
  it('修前真模型 raw 优雅降级', () => {
    const raws = CAPTURE_CHAPTERS.map((_, i) => readFixture(`l1-bad-00${i + 1}.txt`));
    const parsed = raws.map((raw) => {
      let result: ReturnType<typeof parseFindings>;
      expect(() => {
        result = parseFindings(raw);
      }).not.toThrow();
      return result!;
    });
    // 修前无协议形状下模型大面积解析失败是预期证据（ch5/ch8 等体复读正文系裁决 C 豁免的真实行为）
    const errorCount = parsed.filter((p) => p.errors.length > 0).length;
    expect(errorCount).toBeGreaterThanOrEqual(2);
  });

  it('修后真模型 raw 协议解析全过（M4 加固判据）', () => {
    let totalFindings = 0;
    CAPTURE_CHAPTERS.forEach((chapterNo, i) => {
      const raw = readFixture(`l1-good-00${i + 1}.txt`);
      const parsed = parseFindings(raw);
      expect(parsed.errors).toEqual([]);
      expect(parsed.overall).not.toBeNull();
      expect(parsed.overall!).toBeGreaterThanOrEqual(1);
      expect(parsed.overall!).toBeLessThanOrEqual(10);
      const draft = draftFor(chapterNo);
      for (const f of parsed.findings) {
        expect(draft.includes(f.quote), `quote 非 ${chapterNo} 章 draft 子串: ${f.quote.slice(0, 40)}`).toBe(true);
      }
      totalFindings += parsed.findings.length;
    });
    expect(totalFindings).toBeGreaterThanOrEqual(1);
  });
});
