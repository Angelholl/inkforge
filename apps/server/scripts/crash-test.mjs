import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(HERE, '..');
const DATA_DIR = path.join(SERVER_DIR, 'data-crash-test');
const FAKE_PORT = 47900;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 章 uniq 草稿（每 8 字窗口含章号标记 → 章间零重合） */
function draftText(chapterNo) {
  const sents = ['夜雨初歇。', '山道泥泞。', '少年登程。', '枫叶贴石。', '茶棚歇脚。', '客商闲谈。', '告示新贴。', '墨迹未干。', '名字刺目。', '穿街读毕。'];
  let s = '';
  let i = 0;
  while (s.length < 520) {
    s += `【章${chapterNo}段${i}】${sents[i % sents.length]}`;
    i++;
  }
  return s.slice(0, 520);
}

const QC_CANNED = {
  content: [{ type: 'text', text: 'OVERALL: 9' }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 100, output_tokens: 2 },
};
const SUMMARY_CANNED = {
  content: [{ type: 'text', text: 'SUMMARY: 本章推进试炼。\nBEATS:\n- 推进\nTHREADS:\nSTATE:' }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 100, output_tokens: 20 },
};

/** 假 Strata：POST /v1/messages 非流式，每响应延迟 3s；按提示词嗅探路由 draft/qc/summarize。 */
function startFakeStrata() {
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      setTimeout(() => {
        let user = '';
        let stream = false;
        try {
          const body = JSON.parse(raw);
          user = body?.messages?.[0]?.content ?? '';
          stream = !!body?.stream;
        } catch {
          /* ignore */
        }
        let text;
        let usage = { input_tokens: 500, output_tokens: 500 };
        if (user.includes('SUMMARY:')) {
          text = SUMMARY_CANNED.content[0].text;
          usage = SUMMARY_CANNED.usage;
        } else if (user.includes('评审维度') || user.includes('OVERALL')) {
          text = QC_CANNED.content[0].text;
          usage = QC_CANNED.usage;
        } else {
          const m = /第 (\d+) 章/.exec(user);
          const chapterNo = m ? Number(m[1]) : 1;
          text = draftText(chapterNo);
        }
        if (stream) {
          // 管线 draft/rewrite 恒流式（onDelta 恒挂）：回 SSE 事件序列
          res.setHeader('content-type', 'text/event-stream');
          res.write(`event: message_start
data: ${JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: usage.input_tokens } } })}

`);
          res.write(`event: content_block_delta
data: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })}

`);
          res.write(`event: message_delta
data: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: usage.output_tokens } })}

`);
          res.write(`event: message_stop
data: {"type":"message_stop"}

`);
          res.end();
        } else {
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ content: [{ type: 'text', text }], stop_reason: 'end_turn', usage }));
        }
      }, 3000);
    });
  });
  return new Promise((resolve) => server.listen(FAKE_PORT, '127.0.0.1', () => resolve(server)));
}

async function healthOk() {
  try {
    const r = await fetch('http://127.0.0.1:8788/api/health');
    return r.ok;
  } catch {
    return false;
  }
}

const dbOpen = () => new Database(path.join(DATA_DIR, 'inkforge.db'), { readonly: true });

function killPort(port) {
  try {
    const out = execSync(`netstat -ano | findstr ":${port}" | findstr "LISTENING"`, { shell: 'cmd.exe' }).toString();
    const pids = [...new Set(out.split('\n').map((l) => l.trim().split(/ \s+/).pop()).filter((p) => /^\d+$/.test(p)))];
    for (const pid of pids) {
      try {
        execSync(`taskkill /T /F /PID ${pid}`, { shell: 'cmd.exe' });
        console.log('[crash] killed leftover pid', pid);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* 端口空闲 */
  }
}

async function main() {
  killPort(8788);
  await sleep(1500);
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  const fake = await startFakeStrata();
  console.log('[crash] fake strata on', FAKE_PORT);

  const service = spawn(process.execPath, ['--import', 'tsx', path.join(SERVER_DIR, 'src/index.ts')], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      STRATA_BASE_URL: `http://127.0.0.1:${FAKE_PORT}/v1`,
      STRATA_API_KEY: 'strata',
      STRATA_MODEL: 'iq3_xxs',
      INKFORGE_DATA_DIR: DATA_DIR,
      INKFORGE_PORT: '8788',
      INKFORGE_STALE_MS: '3000',
      INKFORGE_SUPERVISOR_BACKOFF_MS: '1000',
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  const cleanup = () => {
    try {
      if (service.pid) execSync(`taskkill /T /F /PID ${service.pid}`, { shell: 'cmd.exe' });
    } catch {
      /* ignore */
    }
    fake.close();
    try {
      fs.rmSync(DATA_DIR, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };
  process.on('exit', () => {
    service.kill();
    fake.close();
  });

  // health
  const hDeadline = Date.now() + 30000;
  while (!(await healthOk())) {
    if (Date.now() > hDeadline) {
      console.error('[crash] health 超时');
      process.exit(1);
    }
    await sleep(300);
  }
  console.log('[crash] service health ok');

  // 建书 3 章
  const bookRes = await fetch('http://127.0.0.1:8788/api/books', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: '压测书' }),
  });
  const book = await bookRes.json();
  for (let i = 1; i <= 3; i++) {
    const r = await fetch(`http://127.0.0.1:8788/api/books/${book.id}/chapters/${i}/blueprint`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: `第${i}章`, blueprint: { goal: `第${i}章推进`, beats: [], mustHaveBeats: [], bannedTopics: [] }, targetChars: 500 }),
    });
    if (!r.ok) {
      console.error('[crash] blueprint PUT 失败', i, await r.text());
      process.exit(1);
    }
  }
  const runRes = await fetch('http://127.0.0.1:8788/api/books/' + book.id + '/generate-all', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  const { runId } = await runRes.json();
  console.log('[crash] runId', runId);

  // 等 ch2 draft inflight
  let ch2StepId = null;
  const d1 = Date.now() + 120000;
  while (Date.now() < d1 && !ch2StepId) {
    await sleep(300);
    let db;
    try {
      db = dbOpen();
      const ch2 = db.prepare('SELECT id FROM chapters WHERE book_id=? AND chapter_no=2').get(book.id);
      if (!ch2) continue;
      const row = db
        .prepare("SELECT * FROM run_steps WHERE run_id=? AND chapter_id=? AND step='draft' AND status='inflight'")
        .get(runId, ch2.id);
      if (row) ch2StepId = row.id;
    } catch {
      /* db 锁瞬态 */
    } finally {
      try {
        db?.close();
      } catch {
        /* ignore */
      }
    }
  }
  if (!ch2StepId) {
    console.error('[crash] 未等到 ch2 draft inflight');
    process.exit(1);
  }
  console.log('[crash] ch2 draft inflight → SIGKILL worker');

  const workerPid = Number(fs.readFileSync(path.join(DATA_DIR, 'worker.pid'), 'utf8').trim());
  process.kill(workerPid, 'SIGKILL');
  console.log('[crash] killed worker pid', workerPid);

  // supervisor 重启 → takeover（INKFORGE_STALE_MS=3000）→ run 终态
  const d2 = Date.now() + 300000;
  let finalStatus = null;
  while (Date.now() < d2) {
    await sleep(1000);
    try {
      const r = await fetch(`http://127.0.0.1:8788/api/runs/${runId}`);
      if (r.ok) {
        const run = await r.json();
        if (['done', 'failed', 'cancelled'].includes(run.status)) {
          finalStatus = run.status;
          break;
        }
      }
    } catch {
      /* ignore */
    }
  }
  const fail = (msg) => {
    console.error('[crash] FAIL:', msg);
    try {
      const d = new Database(path.join(DATA_DIR, 'inkforge.db'), { readonly: true });
      const steps = d.prepare("SELECT step, attempt, status, error, substr(coalesce(output_json,''),1,1200) AS outj FROM run_steps ORDER BY rowid").all();
      console.error('[crash] steps:', JSON.stringify(steps, null, 1));
      const chs = d.prepare('SELECT chapter_no, status, current_version_id FROM chapters').all();
      console.error('[crash] chapters:', JSON.stringify(chs));
      const runRow = d.prepare('SELECT status, error FROM runs').all();
      console.error('[crash] runs:', JSON.stringify(runRow));
      const gateRows = d.prepare("SELECT step, attempt, output_json FROM run_steps WHERE output_json IS NOT NULL").all();
      for (const g of gateRows) {
        try {
          const j = JSON.parse(g.output_json);
          console.error(`[crash] gate ${g.step}#${g.attempt}:`, JSON.stringify(j.gate), '| l0 hardFail:', j.l0?.hardFail, '| l1 findings:', j.l1?.findings?.length, 'invalidQuotes:', j.l1?.invalidQuotes, 'parseErrors:', JSON.stringify(j.l1?.parseErrors));
        } catch {}
      }
      d.close();
    } catch (e) {
      console.error('[crash] diag failed:', e.message);
    }
    cleanup();
    process.exit(1);
  };
  if (finalStatus !== 'done') fail(`run 终态=${finalStatus}`);

  const db = dbOpen();
  const chapters = db.prepare('SELECT * FROM chapters WHERE book_id=? ORDER BY chapter_no').all(book.id);
  for (const ch of chapters) {
    if (ch.status !== 'done') fail(`章${ch.chapter_no} status=${ch.status}`);
    const draftVersions = db
      .prepare("SELECT COUNT(*) AS n FROM chapter_versions WHERE chapter_id=? AND kind='draft'")
      .get(ch.id).n;
    if (draftVersions > 2) fail(`章${ch.chapter_no} draft 版本堆积 ${draftVersions}`);
  }
  const bumped = db.prepare('SELECT COUNT(*) AS n FROM run_steps WHERE run_id=? AND attempt>=2').get(runId).n;
  if (bumped < 1) fail('无 attempt≥2 的 step 行（接管未发生）');
  db.close();

  console.log('[crash] PASS: run done、3 章 done、draft 版本 ≤2、attempt≥2 接管 ✓');
  cleanup();
  process.exit(0);
}

main().catch((e) => {
  console.error('[crash] fatal:', e);
  process.exit(1);
});
