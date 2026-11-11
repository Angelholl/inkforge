import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(HERE, '..');
const REPO_ROOT = path.resolve(SERVER_DIR, '..');
const DATA_DIR = path.resolve(SERVER_DIR, 'data');
const BASE = 'http://127.0.0.1:8787';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const args = process.argv.slice(2);
const VALIDATE = args.includes('--validate');
const CHAPTERS = VALIDATE ? 3 : 20;

async function healthOk() {
  try {
    const r = await fetch(`${BASE}/api/health`);
    return r.ok;
  } catch {
    return false;
  }
}

async function ensureService() {
  if (await healthOk()) {
    console.log('[hang] service already running');
    return;
  }
  console.log('[hang] spawning service...');
  const out = fs.openSync(path.join(DATA_DIR, 'service.log'), 'a');
  const child = spawn('cmd', ['/c', 'pnpm --filter @inkforge/server start'], {
    cwd: REPO_ROOT,
    detached: true,
    stdio: ['ignore', out, out],
    env: process.env,
  });
  child.unref();
  const deadline = Date.now() + 30000;
  while (!(await healthOk())) {
    if (Date.now() > deadline) {
      console.error('[hang] service health 超时');
      process.exit(1);
    }
    await sleep(500);
  }
  console.log('[hang] service healthy');
}

function killPort(port) {
  try {
    const out = execSync(`netstat -ano | findstr ":${port}" | findstr "LISTENING"`, { shell: 'cmd.exe' }).toString();
    const pids = [...new Set(out.split('\n').map((l) => l.trim().split(/\s+/).pop()).filter((p) => /^\d+$/.test(p)))];
    for (const pid of pids) {
      try {
        execSync(`taskkill /T /F /PID ${pid}`, { shell: 'cmd.exe' });
      } catch (e) {
        void e;
      }
    }
  } catch (e) {
    void e; // 端口空闲
  }
}

async function createBook(title, chapters) {
  const r = await fetch(`${BASE}/api/books`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title,
      description:
        '这是一座修行试炼塔，每层试炼独立成篇。少年林澈自塔底登临，逐层破解试炼，遇见故人与敌手，收束前尘伏笔。全书基调冷峻克制，节拍紧凑。',
      characters: [{ name: '林澈', baseSetting: '{"位置":"塔底","持有":["青铜令牌"],"状态":"健康"}' }],
    }),
  });
  const book = await r.json();
  for (let i = 1; i <= chapters; i++) {
    const bp = {
      goal: `主角在试炼第${i}层推进`,
      beats: [`进入第${i}层`, `遭遇第${i}层试炼`, `第${i}层收束与抉择`],
      mustHaveBeats: [],
      bannedTopics: [],
    };
    const pr = await fetch(`${BASE}/api/books/${book.id}/chapters/${i}/blueprint`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: `第${i}层`, blueprint: bp, targetChars: 3000 }),
    });
    if (!pr.ok) {
      console.error(`[hang] blueprint ${i} PUT 失败:`, await pr.text());
      process.exit(1);
    }
  }
  return book.id;
}

async function main() {
  killPort(8788); // 清压测残留
  fs.mkdirSync(DATA_DIR, { recursive: true });
  await ensureService();

  const title = VALIDATE ? '验证-试炼之路-3章' : '挂机-试炼之路';
  const bookId = await createBook(title, CHAPTERS);
  console.log(`[hang] bookId=${bookId} chapters=${CHAPTERS}`);

  const r = await fetch(`${BASE}/api/books/${bookId}/generate-all`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  if (!r.ok) {
    console.error('[hang] runs POST 失败:', await r.text());
    process.exit(1);
  }
  const { runId } = await r.json();
  console.log(`[hang] runId=${runId}`);

  const record = { bookId, runId, startedAt: new Date().toISOString(), mode: VALIDATE ? 'validate-3ch' : 'hang-20ch', chapters: CHAPTERS };
  const recordPath = VALIDATE ? path.join(DATA_DIR, 'validate-run.json') : path.join(DATA_DIR, 'hang-run.json');
  fs.writeFileSync(recordPath, JSON.stringify(record, null, 2), 'utf8');
  console.log(`[hang] ${recordPath} 落盘；run 状态可在 ${BASE} 查看`);
}

main().catch((e) => {
  console.error('[hang] fatal:', e);
  process.exit(1);
});
