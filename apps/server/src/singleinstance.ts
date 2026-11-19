import fs from 'node:fs';
import path from 'node:path';
import { processKillProbe } from './procprobe';

export class SingleInstanceError extends Error {
  constructor(pid: number) {
    super(`another instance holds lock (pid=${pid})`);
    this.name = 'SingleInstanceError';
  }
}

const DEFAULT_STALE_MS = 15_000;
const DEFAULT_TOUCH_MS = 2_000;

/** 读锁内 pid；文件缺失（持有人刚释放）或内容非正整数 → null。 */
function readLockPid(lockPath: string): number | null {
  let raw: string;
  try {
    raw = fs.readFileSync(lockPath, 'utf8').trim();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw e;
  }
  const pid = Number(raw);
  return Number.isFinite(pid) && pid > 0 ? pid : null;
}

/**
 * 单实例锁：dataDir/<file=service.pid>（O_EXCL）+ 心跳。
 * 探测：pid 已死 → 接管；pid 活着但锁 mtime 超 staleMs → 陈旧接管（持有者被硬杀
 * 从不放锁、锁内 pid 被系统复用给无关活进程的场景，2026-11-19 run 永远卡 queued 回归）；
 * 否则 SingleInstanceError。持有者每 touchMs 自动 touch 锁 mtime（unref 间隔）。
 */
export function acquireLock(
  dataDir: string,
  file = 'service.pid',
  opts: { staleMs?: number; touchMs?: number } = {},
): { release(): void } {
  const staleMs = opts.staleMs ?? DEFAULT_STALE_MS;
  const touchMs = opts.touchMs ?? DEFAULT_TOUCH_MS;
  fs.mkdirSync(dataDir, { recursive: true });
  const lockPath = path.join(dataDir, file);
  for (;;) {
    let fd: number;
    try {
      fd = fs.openSync(lockPath, 'wx');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EEXIST') {
        const pid = readLockPid(lockPath);
        if (pid !== null && processKillProbe(pid)) {
          let age: number;
          try {
            age = Date.now() - fs.statSync(lockPath).mtimeMs;
          } catch (e2) {
            if ((e2 as NodeJS.ErrnoException).code === 'ENOENT') continue; // 锁刚被释放，重试
            throw e2;
          }
          if (age <= staleMs) throw new SingleInstanceError(pid);
          // pid 被复用给无关活进程，但锁已无人续鲜 → 走陈旧接管
        }
        try {
          fs.unlinkSync(lockPath); // 死 pid / 陈旧锁接管
        } catch (e2) {
          if ((e2 as NodeJS.ErrnoException).code !== 'ENOENT') throw e2;
        }
        continue;
      }
      throw e;
    }
    fs.writeFileSync(fd, String(process.pid));
    fs.closeSync(fd);
    const heartbeat = setInterval(() => {
      try {
        const now = new Date();
        fs.utimesSync(lockPath, now, now);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') clearInterval(heartbeat);
        // 其余瞬时错误下一轮再试
      }
    }, touchMs);
    heartbeat.unref();
    return {
      release() {
        clearInterval(heartbeat);
        try {
          if (readLockPid(lockPath) === process.pid) fs.unlinkSync(lockPath);
        } catch {
          /* 已被清理 */
        }
      },
    };
  }
}
