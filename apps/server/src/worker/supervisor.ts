import { spawn, type ChildProcess } from 'node:child_process';

const BASE_BACKOFF = [1000, 2000, 4000, 8000, 15000, 30000];
const STABLE_RESET_MS = 60000;

export interface SupervisorHandle {
  child: ChildProcess;
  stop(): Promise<void>;
}

/**
 * worker supervisor：spawn `node --import tsx <entryPath>`；
 * 退避重启（序列 ×2^n，稳定运行 60s 重置）；exit 0 视为主动退出不再重启；
 * INKFORGE_SUPERVISOR_BACKOFF_MS 覆盖基准退避（测试用 100）。
 */
export function spawnWorkerSupervisor(opts: {
  entryPath: string;
  env: NodeJS.ProcessEnv;
  onMessage?: (m: unknown) => void;
}): SupervisorHandle {
  const base = Number(opts.env.INKFORGE_SUPERVISOR_BACKOFF_MS ?? 0) > 0 ? Number(opts.env.INKFORGE_SUPERVISOR_BACKOFF_MS) : BASE_BACKOFF[0];
  const stopped = { value: false };
  let child: ChildProcess | null = null;
  let attempt = 0;
  let startedAt = 0;
  let stopping = false;
  const exits = new Promise<void>((resolveExit) => {
    resolveExit();
  });
  void exits;

  const launch = () => {
    if (stopped.value) return;
    child = spawn(process.execPath, ['--import', 'tsx', opts.entryPath], {
      env: opts.env,
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    startedAt = Date.now();
    child.on('message', (m) => {
      opts.onMessage?.(m); // 跨重启转发（每次 restart 是新进程对象）
    });
    child.on('exit', (code) => {
      if (stopping || stopped.value) return;
      if (code === 0) {
        stopped.value = true; // 主动退出不重启
        return;
      }
      // 稳定运行 60s 后重置退避
      if (Date.now() - startedAt > STABLE_RESET_MS) attempt = 0;
      const delay = Math.min(base * 2 ** attempt, 30000);
      attempt = Math.min(attempt + 1, 5);
      setTimeout(launch, delay);
    });
  };
  launch();

  return {
    get child(): ChildProcess {
      return child!;
    },
    async stop(): Promise<void> {
      stopping = true;
      stopped.value = true;
      const c = child;
      if (c && c.exitCode === null && !c.killed) {
        c.kill();
        await new Promise<void>((resolve) => {
          c.on('exit', () => resolve());
          setTimeout(resolve, 2000);
        });
      }
    },
  };
}
