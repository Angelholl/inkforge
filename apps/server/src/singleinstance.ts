import fs from 'node:fs';
import path from 'node:path';
import { processKillProbe } from './procprobe';

export class SingleInstanceError extends Error {
  constructor(pid: number) {
    super(`another instance holds lock (pid=${pid})`);
    this.name = 'SingleInstanceError';
  }
}

/** 单实例锁：dataDir/<file=service.pid>（O_EXCL）；pid 存活→SingleInstanceError；死 pid 接管。 */
export function acquireLock(dataDir: string, file = 'service.pid'): { release(): void } {
  fs.mkdirSync(dataDir, { recursive: true });
  const lockPath = path.join(dataDir, file);
  for (;;) {
    let fd: number;
    try {
      fd = fs.openSync(lockPath, 'wx');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EEXIST') {
        const raw = fs.readFileSync(lockPath, 'utf8').trim();
        const pid = Number(raw);
        if (Number.isFinite(pid) && pid > 0 && processKillProbe(pid)) {
          throw new SingleInstanceError(pid);
        }
        fs.unlinkSync(lockPath); // 死 pid 接管
        continue;
      }
      throw e;
    }
    fs.writeFileSync(fd, String(process.pid));
    fs.closeSync(fd);
    return {
      release() {
        try {
          const cur = fs.readFileSync(lockPath, 'utf8').trim();
          if (cur === String(process.pid)) fs.unlinkSync(lockPath);
        } catch {
          /* 已被清理 */
        }
      },
    };
  }
}
