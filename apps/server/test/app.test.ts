import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';

describe('health endpoint', () => {
  it('GET /api/health → 200 {ok:true, version:0.2.3}', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, version: '0.2.3' });
  });
});
