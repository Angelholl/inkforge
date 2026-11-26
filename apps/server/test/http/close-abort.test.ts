import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import type { FastifyReply } from 'fastify';
import { abortOnDisconnect } from '../../src/http/close-abort';

function fakeReply(sent: boolean): FastifyReply {
  return { raw: new EventEmitter(), sent } as unknown as FastifyReply;
}

describe('abortOnDisconnect', () => {
  it('close 且未发送 → abort', () => {
    const reply = fakeReply(false);
    const ac = new AbortController();
    abortOnDisconnect(reply, ac);
    (reply.raw as EventEmitter).emit('close');
    expect(ac.signal.aborted).toBe(true);
  });
  it('close 但已发送 → 不 abort', () => {
    const reply = fakeReply(true);
    const ac = new AbortController();
    abortOnDisconnect(reply, ac);
    (reply.raw as EventEmitter).emit('close');
    expect(ac.signal.aborted).toBe(false);
  });
});
