import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config';
import { openDb } from '../src/db/open';
import { migrate } from '../src/db/migrate';
import { createBook } from '../src/db/repositories/books';
import { upsertBlueprint, getVersion as chaptersGetVersion } from '../src/db/repositories/chapters';
import { createRun, listSteps, getStep, updateRunStatus } from '../src/db/repositories/runs';
import { runChapterPipeline } from '../src/pipeline/chapter';
import { createAnthropicProvider } from '../src/llm/anthropic';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** R1 关口：Strata 真模型单章全流程基线（draft+qc+重写+summarize+finalize），totalMs ≤ 2700000 判 PASS。 */
async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const dataDir = path.join(HERE, '../../data-baseline');
  const db = openDb(path.join(dataDir, 'baseline.db'));
  migrate(db);

  const now = new Date().toISOString();
  const bookId = createBook(db, {
    title: 'R1 基线书',
    description:
      '北境边城临霜城，城墙以玄铁铸就，终年风雪。城中修行者以「霜脉」引寒气入体，' +
      '修至深处可凝冰成兵。主角沈砚是守夜人后裔，持有残缺的守夜符牌，能听见城墙之下的低语。' +
      '城外雪原有游牧部族与雪狼群，夜半常闻号角。城主府与守夜人一脉积怨已久，' +
      '符牌的来历是沈砚身世的关键。全书冷峻克制，善用风雪意象与短句节奏。',
    characters: [
      { name: '沈砚', baseSetting: '{"位置":"临霜城","持有":["残缺守夜符牌"],"状态":"健康"}' },
      { name: '城主赵拔', baseSetting: '{"位置":"城主府","立场":"戒备守夜人"}' },
    ],
  }).id;
  void randomUUID;
  const chapterNo = 1;
  upsertBlueprint(db, {
    bookId,
    chapterNo,
    title: '风雪入城',
    targetChars: 3000,
    blueprint: {
      goal: '沈砚在风雪夜巡城时听到城墙低语，与城主府巡卫发生冲突，埋下符牌来历的悬念',
      beats: ['风雪巡城', '城墙低语', '与巡卫冲突', '符牌异动'],
      mustHaveBeats: [{ text: '符牌异动', keywords: ['符牌'] }],
      bannedTopics: [],
    },
  });
  const run = createRun(db, { bookId, mode: 'generate', chapterScope: { from: chapterNo, to: chapterNo } });
  updateRunStatus(db, run.id, 'running', { startedAt: new Date().toISOString() });

  const provider = createAnthropicProvider(config.providers.local);
  const t0 = Date.now();
  let firstTokenMs: number | null = null;
  const emit = (e: { type: string; text?: string }) => {
    if (firstTokenMs === null && e.type === 'step.delta' && e.text) {
      firstTokenMs = Date.now() - t0;
    }
  };
  console.log(`[baseline] 开始: model=${config.providers.local.model} base=${config.providers.local.baseURL}`);
  const outcome = await runChapterPipeline({ db, provider, config, emit }, { runId: run.id, bookId, chapterNo });
  const totalMs = Date.now() - t0;

  const steps = listSteps(db, run.id);
  const perStepMs: Record<string, number> = {};
  const usagePerStep: Record<string, unknown> = {};
  for (const s of steps) {
    const key = `${s.step}#${s.attempt}`;
    perStepMs[key] = s.startedAt && s.endedAt ? new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime() : 0;
    if (s.outputVersionId) {
      const v = chaptersGetVersion(db, s.outputVersionId);
      if (v) usagePerStep[key] = (v.params as { usage?: unknown }).usage ?? null;
    }
  }
  const draftTokens = Number((usagePerStep['draft#1'] as { completionTokens?: number })?.completionTokens ?? 0);
  const draftMs = perStepMs['draft#1'] ?? 0;
  const tokPerSec = draftMs > 0 ? Number((draftTokens / (draftMs / 1000)).toFixed(1)) : 0;

  const result = {
    model: config.providers.local.model,
    outcome: outcome.status,
    rounds: outcome.rounds,
    totalMs,
    firstTokenMs,
    tokPerSec,
    perStepMs,
    usagePerStep,
    gate: getStep(db, steps.find((s) => s.step === 'qc')!.id)?.outputJson ?? null,
    timestamp: new Date().toISOString(),
  };
  const outPath = path.join(HERE, '../../docs/baseline/strata-baseline.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(`[baseline] outcome=${outcome.status} rounds=${outcome.rounds} totalMs=${totalMs} tokPerSec=${tokPerSec}`);
  console.log(`[baseline] 结果落盘: ${outPath}`);
  db.close();
  process.exit(totalMs <= 2700000 && outcome.status !== 'failed' ? 0 : 2);
}

void main().catch((e) => {
  console.error('[baseline] fatal:', e);
  process.exit(1);
});
