import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  createPracticeAudioToken,
  createPracticePlayerToken,
  verifyPracticeAudioToken,
  verifyPracticePlayerToken,
} from './practice-player.js';

const claims = {
  sessionId: '10000000-0000-4000-8000-000000000001',
  startAtEpochMs: Date.parse('2026-07-29T18:00:00.000Z'),
  expiresAtEpochMs: Date.parse('2026-07-30T18:00:00.000Z'),
};

describe('practice player tokens', () => {
  it('verifies a current token and rejects tampering or expiry', () => {
    const secret = randomBytes(32);
    const token = createPracticePlayerToken(secret, claims);

    expect(verifyPracticePlayerToken(secret, token, new Date('2026-07-29T19:00:00.000Z'))).toEqual(
      claims,
    );
    expect(
      verifyPracticePlayerToken(secret, `${token}x`, new Date('2026-07-29T19:00:00.000Z')),
    ).toBeUndefined();
    expect(
      verifyPracticePlayerToken(secret, token, new Date('2026-07-31T00:00:00.000Z')),
    ).toBeUndefined();
  });

  it('uses separate signatures for player access and audio delivery', () => {
    const secret = randomBytes(32);
    const player = createPracticePlayerToken(secret, claims);
    const audio = createPracticeAudioToken(secret, claims);

    expect(
      verifyPracticeAudioToken(secret, player, new Date('2026-07-29T19:00:00.000Z')),
    ).toBeUndefined();
    expect(verifyPracticeAudioToken(secret, audio, new Date('2026-07-29T19:00:00.000Z'))).toEqual(
      claims,
    );
  });
});
