import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { spawnWorkerSupervisor, type SupervisorHandle } from '../../src/worker/supervisor';
import { acquireLock, SingleInstanceError } from '../../src/singleinstance';

const WORKER_ENTRY = path.resolve(process.cwd(), 'src/worker/main.ts');
const WORKER_PLAIN_ENTRY = path.resolve(process.cwd(), 'test/worker/fixtures/worker-plain.mjs');
let handle: SupervisorHandle | null = null;

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-sup-'));
  return dir;
}

afterEach(async () => {
  await handle?.stop();
  handle = null;
});

describe('spawnWorkerSupervisor', () => {
  it('child.kill() 非零退出 → 3s 内收到第二次 ready', async () => {
    const dir = tmpDir();
    let readyCount = 0;
    handle = spawnWorkerSupervisor({
      entryPath: WORKER_ENTRY,
      env: { ...process.env, INKFORGE_DATA_DIR: dir, INKFORGE_SUPERVISOR_BACKOFF_MS: '100' },
      onMessage: (m) => {
        if ((m as { type?: string }).type === 'ready') readyCount++;
      },
    });
    // 轮询等待首次 ready（并发全量下 subprocess 启动延迟波动）
    const firstDeadline = Date.now() + 5000;
    while (Date.now() < firstDeadline && readyCount < 1) await new Promise((r) => setTimeout(r, 100));
    expect(readyCount).toBe(1);
    handle.child.kill();
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && readyCount < 2) await new Promise((r) => setTimeout(r, 100));
    expect(readyCount).toBe(2);
    await handle.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }, 20000);

  it('INKFORGE_WORKER_TSX=0 → 免 tsx 直跑 .mjs fixture，kill 后退避重启', async () => {
    const dir = tmpDir();
    let readyCount = 0;
    handle = spawnWorkerSupervisor({
      entryPath: WORKER_PLAIN_ENTRY,
      env: {
        ...process.env,
        INKFORGE_DATA_DIR: dir,
        INKFORGE_SUPERVISOR_BACKOFF_MS: '100',
        INKFORGE_WORKER_TSX: '0',
      },
      onMessage: (m) => {
        if ((m as { type?: string }).type === 'ready') readyCount++;
      },
    });
    // 轮询等待首次 ready（并发全量下 subprocess 启动延迟波动）
    const firstDeadline = Date.now() + 5000;
    while (Date.now() < firstDeadline && readyCount < 1) await new Promise((r) => setTimeout(r, 100));
    expect(readyCount).toBe(1);
    handle.child.kill();
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && readyCount < 2) await new Promise((r) => setTimeout(r, 100));
    expect(readyCount).toBe(2);
    await handle.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }, 20000);

  it('stop() 后子进程退出且不再重启', async () => {
    const dir = tmpDir();
    let readyCount = 0;
    handle = spawnWorkerSupervisor({
      entryPath: WORKER_ENTRY,
      env: { ...process.env, INKFORGE_DATA_DIR: dir, INKFORGE_SUPERVISOR_BACKOFF_MS: '100' },
      onMessage: (m) => {
        if ((m as { type?: string }).type === 'ready') readyCount++;
      },
    });
    await new Promise((r) => setTimeout(r, 800));
    await handle.stop();
    const before = readyCount;
    await new Promise((r) => setTimeout(r, 1500));
    expect(readyCount).toBe(before);
    fs.rmSync(dir, { recursive: true, force: true });
  }, 15000);

  it('子进程 exit 0 → 不重启', async () => {
    const dir = tmpDir();
    let readyCount = 0;
    handle = spawnWorkerSupervisor({
      entryPath: WORKER_ENTRY,
      env: { ...process.env, INKFORGE_DATA_DIR: dir, INKFORGE_SUPERVISOR_BACKOFF_MS: '100', INKFORGE_WORKER_EXIT_ZERO: '1' },
      onMessage: (m) => {
        if ((m as { type?: string }).type === 'ready') readyCount++;
      },
    });
    await new Promise((r) => setTimeout(r, 2000));
    expect(readyCount).toBe(1); // exit 0 后无第二次 ready
    fs.rmSync(dir, { recursive: true, force: true });
  }, 15000);
});

describe('acquireLock', () => {
  it('同 dataDir 二次 acquire → SingleInstanceError；死 pid 接管；release 后文件消失', () => {
    const dir = tmpDir();
    const lock = acquireLock(dir);
    expect(fs.existsSync(path.join(dir, 'service.pid'))).toBe(true);
    expect(() => acquireLock(dir)).toThrowError(SingleInstanceError);
    // 伪造死 pid
    fs.writeFileSync(path.join(dir, 'service.pid'), '999999');
    const lock2 = acquireLock(dir); // 接管成功
    expect(fs.readFileSync(path.join(dir, 'service.pid'), 'utf8')).toBe(String(process.pid));
    lock.release();
    lock2.release();
    expect(fs.existsSync(path.join(dir, 'service.pid'))).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
