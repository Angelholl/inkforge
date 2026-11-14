import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../src/db/migrate';
import { openDb, type Database } from '../src/db/open';
import { analyzeImitation } from '../src/imitation';
import type { LlmProvider } from '../src/llm/types';

const STRUCTURE_TEXT = `STRUCTURE: 开篇以少年失去引子建立动机。
STRUCTURE: 第一卷单线推进，二卷起双线交织。
STRUCTURE: 每卷末以身份揭示收束。
STRUCTURE: 高潮前安排一次全线挫败。
STRUCTURE: 结局回收开篇信物。`;

const RULES_TEXT = `RULES: 平均句长 10-20 字。
RULES: 对话占比 20%-40%。`;

const BLUEPRINT_TEXT = `# 1
GOAL: 少年出发
BEATS:
- 告别村落
- 初遇同伴
HOOK: 身后炊烟散尽
# 2
GOAL: 入城遇阻
BEATS:
- 守卫盘查
- 贵人相助
HOOK: 贵人身份成谜
# 3
GOAL: 立足 Book
BEATS:
- 通过考验
- 结成同盟
HOOK: 密信落款`;

const BAD_BLUEPRINT_TEXT = '本书采用总-分-总结构：先立动机，再分卷推进，末卷收束。';

const SAMPLE = '山川草木皆有意。'.repeat(60) + '少年负匣而行。'.repeat(40);

let db: Database;
let dir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-imitation-'));
  db = openDb(path.join(dir, 't.db'));
  migrate(db);
});

afterAll(() => {
  try {
    db.close();
  } catch {
    /* ignore */
  }
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows 锁瞬态 */
  }
});

describe('analyzeImitation 管线', () => {
  it('三调用形态：structure(8×2000 抽样)→style(few-shot RULES)→blueprint(# 章号块)，draft 字段齐备不入库', async () => {
    const calls: Array<{ user: string; step: string }> = [];
    const capturing: LlmProvider = {
      complete: async (req) => {
        calls.push({ user: req.user, step: req.meta.step });
        const i = calls.length;
        return {
          text: [STRUCTURE_TEXT, RULES_TEXT, BLUEPRINT_TEXT][i - 1],
          usage: { promptTokens: 0, completionTokens: 0 },
          finishReason: 'stop',
        };
      },
    };
    const draft = await analyzeImitation({ db, provider: capturing }, { name: '仿写A', text: SAMPLE, chapterCount: 3 });
    expect(calls).toHaveLength(3);
    expect(calls.every((c) => c.step === 'summarize')).toBe(true);
    // ① 结构调用带 8×2000 抽样片段分隔
    expect(calls[0].user).toContain('STRUCTURE:');
    expect(calls[0].user).toContain('【抽样片段开始】');
    // ② 文风调用复用 RULES 指令
    expect(calls[1].user).toContain('【样本开始】');
    // ③ 蓝图调用带章数协议
    expect(calls[2].user).toContain('第 1..3 章');
    // draft 字段
    expect(draft.name).toBe('仿写A');
    expect(draft.structure).toHaveLength(5);
    expect(draft.structure[0]).toContain('动机');
    expect(draft.style.rulesText).toContain('平均句长');
    expect(draft.blueprint).toHaveLength(3);
    expect(draft.blueprint[0].blueprint.goal).toBe('少年出发');
    expect(draft.metrics).toHaveProperty('medianSentenceLen');
    expect(draft.sourceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(draft.sourcePath).toBe(`inline:${draft.sourceHash.slice(0, 8)}`);
    // 不入库
    const n = db.prepare('SELECT COUNT(*) AS n FROM imitation_profiles').get() as { n: number };
    expect(n.n).toBe(0);
  });

  it('蓝图首调缺块 → repair 重调后成功；文本 <200 字抛错', async () => {
    const texts = [STRUCTURE_TEXT, RULES_TEXT, BAD_BLUEPRINT_TEXT, BLUEPRINT_TEXT];
    const calls: string[] = [];
    const provider: LlmProvider = {
      complete: async (req) => {
        calls.push(req.user);
        return { text: texts[calls.length - 1], usage: { promptTokens: 0, completionTokens: 0 }, finishReason: 'stop' };
      },
    };
    const draft = await analyzeImitation({ db, provider }, { name: '仿写B', text: SAMPLE, chapterCount: 3 });
    expect(calls).toHaveLength(4);
    expect(calls[3]).toContain('解析失败重试');
    expect(draft.blueprint).toHaveLength(3);
    expect(draft.blueprint[2].blueprint.goal).toBe('立足 Book');

    await expect(analyzeImitation({ db, provider }, { name: '仿写C', text: '太短', chapterCount: 3 })).rejects.toThrow(
      /禁止拆解/,
    );
  });
});
