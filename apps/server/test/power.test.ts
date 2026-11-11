import { afterEach, describe, expect, it } from 'vitest';
import { injectKoffiForTest, keepSystemAwake } from '../src/power';

describe('keepSystemAwake', () => {
  afterEach(() => injectKoffiForTest(null));

  it('on/off 调用实参钉死（0x80000001 / 0x80000000）', () => {
    const calls: number[] = [];
    injectKoffiForTest(() => ({
      func: (_conv: string, _name: string, _ret: string, args: string[]) => (flag: number) => {
        expect(args).toEqual(['uint32']);
        calls.push(flag);
        return 0x80000000;
      },
    }));
    keepSystemAwake(true);
    keepSystemAwake(false);
    expect(calls.map((c) => c >>> 0)).toEqual([0x80000001, 0x80000000]);
  });
});
