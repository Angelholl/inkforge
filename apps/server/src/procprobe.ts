/** 进程存活探测：进程存在（含他人进程 EPERM）→ true；不存在 → false。 */
export function processKillProbe(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'EPERM') return true;
    return false;
  }
}
