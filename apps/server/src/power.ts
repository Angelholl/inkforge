import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const ES_CONTINUOUS = 0x80000000;
const ES_SYSTEM_REQUIRED = 0x00000001;

type ExecStateFn = (flag: number) => number;
type KoffiLoader = () => { func: (conv: string, name: string, ret: string, args: string[]) => ExecStateFn };

let koffiLoader: KoffiLoader | null = null;

/** 测试注入（require 绕过 ESM mock，不能 vi.mock）。 */
export function injectKoffiForTest(loader: KoffiLoader | null): void {
  koffiLoader = loader;
}

/** 挂机期间阻止系统睡眠（kernel32 SetThreadExecutionState）；非 win32 no-op。 */
export function keepSystemAwake(on: boolean): void {
  if (process.platform !== 'win32') return;
  try {
    const load = koffiLoader ?? (() => {
      const koffi = require('koffi') as { load: (name: string) => { func: (conv: string, name: string, ret: string, args: string[]) => ExecStateFn } };
      return koffi.load('kernel32.dll');
    });
    const lib = load();
    // SetThreadExecutionState 作用于调用线程：每次 on/off 独立声明并调用
    const setThreadExecutionState = lib.func('__stdcall', 'SetThreadExecutionState', 'uint32', ['uint32']);
    setThreadExecutionState(on ? ES_SYSTEM_REQUIRED | ES_CONTINUOUS : ES_CONTINUOUS);
  } catch (e) {
    console.warn('[power] SetThreadExecutionState 失败:', (e as Error).message);
  }
}
