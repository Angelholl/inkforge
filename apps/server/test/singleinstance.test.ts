import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { acquireLock, SingleInstanceError } from '../src/singleinstance';

// 回归场景（2026-11-19 run 永远卡 queued）：worker 被硬杀从不释放 worker.lock，
// 锁内 pid 被操作系统复用给无关活进程后，探测只看 pid 存活 → 新 worker 永远拒绝启动。
// 修复 = 心跳锁：持有者定期 touch 锁 mtime，pid 活着但 mtime 超龄视为陈旧接管。

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'inkforge-lock-'));
}

function backdate(lockPath: string, msAgo: number): void {
  const t = new Date(Date.now() - msAgo);
  fs.utimesSync(lockPath, t, t);
}

async function deadPid(): Promise<number> {
  return new Promise((resolve, reject) => {
    const c = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
    c.on('exit', () => resolve(c.pid as number));
    c.on('error', reject);
  });
}

describe('acquireLock 心跳锁', () => {
  it('pid 活着但锁 mtime 超 staleMs → 陈旧接管，不抛错', () => {
    const dir = tmpDir();
    const lockPath = path.join(dir, 'service.pid');
    fs.writeFileSync(lockPath, String(process.pid)); // 自进程 = 活着的"复用者"
    backdate(lockPath, 60_000);
    const lock = acquireLock(dir, 'service.pid', { staleMs: 15_000, touchMs: 2_000 });
    expect(fs.readFileSync(lockPath, 'utf8').trim()).toBe(String(process.pid));
    lock.release();
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('pid 活着且 mtime 新鲜 → 仍拒绝（SingleInstanceError）', () => {
    const dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'service.pid'), String(process.pid));
    expect(() => acquireLock(dir, 'service.pid', { staleMs: 15_000, touchMs: 2_000 })).toThrow(
      SingleInstanceError,
    );
  });

  it('心跳按 touchMs 续鲜：被回拨的锁会被持有者刷新回新鲜', async () => {
    const dir = tmpDir();
    const lockPath = path.join(dir, 'service.pid');
    const lock = acquireLock(dir, 'service.pid', { staleMs: 400, touchMs: 50 });
    backdate(lockPath, 60_000); // 模拟一度陈旧
    await new Promise((r) => setTimeout(r, 200)); // 等 ≥2 次 touch
    const age = Date.now() - fs.statSync(lockPath).mtimeMs;
    expect(age).toBeLessThan(400); // 心跳已把 mtime 拉回新鲜 → 不会被误判陈旧接管
    lock.release();
  });

  it('死 pid → 直接接管（既有行为不回退）', async () => {
    const dir = tmpDir();
    const pid = await deadPid();
    fs.writeFileSync(path.join(dir, 'service.pid'), String(pid));
    const lock = acquireLock(dir, 'service.pid', { staleMs: 15_000, touchMs: 2_000 });
    lock.release();
  });
});
