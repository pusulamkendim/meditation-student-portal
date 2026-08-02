import type { FastifyReply, FastifyRequest } from 'fastify';

export function sendAudio(
  request: FastifyRequest,
  reply: FastifyReply,
  file: { filename: string; contentType: string; buffer: Buffer },
) {
  const size = file.buffer.byteLength;
  const base = reply
    .header('content-type', file.contentType)
    .header('content-disposition', `inline; filename="${encodeURIComponent(file.filename)}"`)
    .header('accept-ranges', 'bytes');
  const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? '');
  if (!match) return base.header('content-length', size).send(file.buffer);
  const start = match[1] ? Number.parseInt(match[1], 10) : 0;
  const end = match[2] ? Number.parseInt(match[2], 10) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start ||
    end >= size
  )
    return reply.code(416).header('content-range', `bytes */${size}`).send();
  return base
    .code(206)
    .header('content-range', `bytes ${start}-${end}/${size}`)
    .header('content-length', end - start + 1)
    .send(file.buffer.subarray(start, end + 1));
}
