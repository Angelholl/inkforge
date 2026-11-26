import type { FastifyReply } from 'fastify';

/**
 * 断连即中止：挂 reply.raw 的 close。
 * req.raw 的 close 在请求体读完即触发（真 socket），会秒杀本次 LLM 调用，
 * 故必须挂 reply.raw；inject 测不出此差异（收口黑盒实证）。
 */
export function abortOnDisconnect(reply: FastifyReply, ac: AbortController): void {
  reply.raw.once('close', () => {
    if (!reply.sent) ac.abort();
  });
}
