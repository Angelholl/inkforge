import { describe, expect, it } from 'vitest';
import { nudgeWeights } from '../src/fusion';

describe('shared/nudgeWeights', () => {
  it('A1a 目标 +20：其余按现有比例吸收', () => {
    expect(nudgeWeights({ A: 60, B: 20, C: 20 }, 'A', 20)).toEqual({ A: 80, B: 10, C: 10 });
  });

  it('A1b 目标 −20 触底：单档夹 1、余额按小数余数分摊', () => {
    expect(nudgeWeights({ A: 60, B: 20, C: 20 }, 'B', -20)).toEqual({ A: 74, B: 1, C: 25 });
  });

  it('A1c 唯一档不变', () => {
    expect(nudgeWeights({ A: 100 }, 'A', 20)).toEqual({ A: 100 });
    expect(nudgeWeights({ A: 100 }, 'A', -20)).toEqual({ A: 100 });
  });

  it('A1d 空 map 浅拷贝原样返回', () => {
    const input = {};
    const out = nudgeWeights(input, 'A', 20);
    expect(out).toEqual({});
    expect(out).not.toBe(input);
  });

  it('A1e id 不在键集 → 浅拷贝原样返回', () => {
    const input = { A: 60, B: 40 };
    const out = nudgeWeights(input, 'C', 20);
    expect(out).toEqual({ A: 60, B: 40 });
    expect(out).not.toBe(input);
  });

  it('A1f 越界夹边：目标钳到 100−(n−1)，其余档仍 ≥1', () => {
    expect(nudgeWeights({ A: 99, B: 1 }, 'A', 20)).toEqual({ A: 99, B: 1 });
  });
});
