import type { FastifyReply, FastifyRequest } from 'fastify';

const CACHE_CONTROL = 'public, max-age=60, s-maxage=86400, stale-while-revalidate=604800';

export function sendImage(
  reply: FastifyReply,
  file: { contentType: string; buffer: Buffer },
  cacheControl = 'private, no-store',
) {
  return reply
    .header('content-type', file.contentType)
    .header('cache-control', cacheControl)
    .header('content-length', file.buffer.byteLength)
    .send(file.buffer);
}

export function sendPublicImage(
  request: FastifyRequest,
  reply: FastifyReply,
  file: { contentType: string; buffer: Buffer; etag: string },
) {
  const etag = `"${file.etag}"`;
  const base = reply.header('cache-control', CACHE_CONTROL).header('etag', etag);
  if (request.headers['if-none-match'] === etag) return base.code(304).send();
  return base
    .header('content-type', file.contentType)
    .header('content-length', file.buffer.byteLength)
    .send(file.buffer);
}
