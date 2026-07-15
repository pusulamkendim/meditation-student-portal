import { describe, expect, it } from 'vitest';
import { parseTypedPracticeResponse } from './practice-response.js';

describe('typed practice responses', () => {
  it.each(['YAPTIM', 'Yaptım', 'yaptım', 'Yaptim', 'yaptim'])(
    'recognizes %s as completed',
    (input) => {
      expect(parseTypedPracticeResponse(input)).toBe('COMPLETED');
    },
  );

  it.each(['YAPAMADIM', 'Yapamadım', 'yapamadım', 'Yapamadim', 'yapamadim'])(
    'recognizes %s as skipped',
    (input) => {
      expect(parseTypedPracticeResponse(input)).toBe('SKIPPED');
    },
  );
});
