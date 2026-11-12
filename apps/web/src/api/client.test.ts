import { describe, expect, it } from 'vitest';
import { resolveApiBase } from './client';

describe('resolveApiBase', () => {
  it('生产态返回本机绝对地址', () => {
    expect(resolveApiBase(false)).toBe('http://127.0.0.1:8787');
  });

  it('dev 态返回空串以走 vite 代理', () => {
    expect(resolveApiBase(true)).toBe('');
  });
});
