import { createHmac, timingSafeEqual } from 'node:crypto';

export type PracticePlayerClaims = {
  sessionId: string;
  startAtEpochMs: number;
  expiresAtEpochMs: number;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createPracticePlayerToken(secret: Buffer, claims: PracticePlayerClaims): string {
  return createToken(secret, 'practice-player', claims);
}

export function verifyPracticePlayerToken(
  secret: Buffer,
  token: string,
  now: Date,
): PracticePlayerClaims | undefined {
  return verifyToken(secret, 'practice-player', token, now);
}

export function createPracticeAudioToken(secret: Buffer, claims: PracticePlayerClaims): string {
  return createToken(secret, 'practice-audio', claims);
}

export function verifyPracticeAudioToken(
  secret: Buffer,
  token: string,
  now: Date,
): PracticePlayerClaims | undefined {
  return verifyToken(secret, 'practice-audio', token, now);
}

function createToken(secret: Buffer, domain: string, claims: PracticePlayerClaims): string {
  validateClaims(secret, claims);
  const payload = Buffer.from(
    JSON.stringify({
      s: claims.sessionId,
      t: claims.startAtEpochMs,
      e: claims.expiresAtEpochMs,
    }),
  ).toString('base64url');
  return `${payload}.${signature(secret, domain, payload)}`;
}

function verifyToken(
  secret: Buffer,
  domain: string,
  token: string,
  now: Date,
): PracticePlayerClaims | undefined {
  if (secret.length < 32 || token.length > 512) return undefined;
  const [payload, suppliedSignature, residue] = token.split('.');
  if (!payload || !suppliedSignature || residue) return undefined;
  const expected = Buffer.from(signature(secret, domain, payload), 'base64url');
  const supplied = Buffer.from(suppliedSignature, 'base64url');
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      s?: unknown;
      t?: unknown;
      e?: unknown;
    };
    const claims = {
      sessionId: parsed.s,
      startAtEpochMs: parsed.t,
      expiresAtEpochMs: parsed.e,
    };
    if (
      typeof claims.sessionId !== 'string' ||
      !uuidPattern.test(claims.sessionId) ||
      !Number.isSafeInteger(claims.startAtEpochMs) ||
      !Number.isSafeInteger(claims.expiresAtEpochMs) ||
      Number(claims.expiresAtEpochMs) <= Number(claims.startAtEpochMs) ||
      Number(claims.expiresAtEpochMs) < now.getTime()
    )
      return undefined;
    return claims as PracticePlayerClaims;
  } catch {
    return undefined;
  }
}

function validateClaims(secret: Buffer, claims: PracticePlayerClaims) {
  if (secret.length < 32) throw new Error('Practice player HMAC key must be at least 32 bytes.');
  if (!uuidPattern.test(claims.sessionId))
    throw new Error('Practice player session id must be a UUID.');
  if (
    !Number.isSafeInteger(claims.startAtEpochMs) ||
    !Number.isSafeInteger(claims.expiresAtEpochMs) ||
    claims.expiresAtEpochMs <= claims.startAtEpochMs
  )
    throw new Error('Practice player token dates are invalid.');
}

function signature(secret: Buffer, domain: string, payload: string): string {
  return createHmac('sha256', secret).update(`${domain}:${payload}`, 'utf8').digest('base64url');
}
