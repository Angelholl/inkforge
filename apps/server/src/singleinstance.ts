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
        // 死 pid / 陈旧锁接管：rename 原子夺走（2026-11-20 审计收敛）。
        // 旧实现 unlinkSync 非原子：A unlink→建新锁后，B 若也已判陈旧，其 unlink 会删掉
        // A 的新锁而非陈旧锁 → A/B 双持锁 → 双 worker 并发跑队列。rename 只可能有一个
        // 进程成功，其余 ENOENT 回环重看；持有者复活竞态由 staleMs≫touchMs 余量兜底。
        try {
          fs.renameSync(lockPath, `${lockPath}.stale`);
        } catch (e2) {
          if ((e2 as NodeJS.ErrnoException).code === 'ENOENT') continue; // 已被其他接管者夺走 → 重看
          throw e2;
        }
        try {
          fs.unlinkSync(`${lockPath}.stale`); // 旧锁清理 best-effort；残留无害（下次接管 rename 覆盖）
        } catch {
          /* ignore */
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
