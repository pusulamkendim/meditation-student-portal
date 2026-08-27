import { describe, expect, it } from 'vitest';

import { normalizeCoverImageAlt, validateCoverImage } from './cover-image.js';

describe('validateCoverImage', () => {
  it('accepts JPEG, PNG and WebP signatures', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const webp = Buffer.from('RIFF0000WEBP', 'ascii');

    expect(
      validateCoverImage({ filename: 'cover.jpg', mimetype: 'image/jpeg', buffer: jpeg }),
    ).toMatchObject({ extension: 'jpg', contentType: 'image/jpeg' });
    expect(
      validateCoverImage({ filename: 'cover.png', mimetype: 'image/png', buffer: png }),
    ).toMatchObject({ extension: 'png', contentType: 'image/png' });
    expect(
      validateCoverImage({ filename: 'cover.webp', mimetype: 'image/webp', buffer: webp }),
    ).toMatchObject({ extension: 'webp', contentType: 'image/webp' });
  });

  it('rejects SVG, empty files and mismatched signatures', () => {
    expect(() =>
      validateCoverImage({
        filename: 'cover.svg',
        mimetype: 'image/svg+xml',
        buffer: Buffer.from('<svg />'),
      }),
    ).toThrow('Yalnızca JPEG, PNG veya WebP');
    expect(() =>
      validateCoverImage({
        filename: 'cover.jpg',
        mimetype: 'image/jpeg',
        buffer: Buffer.alloc(0),
      }),
    ).toThrow('boş olamaz');
    expect(() =>
      validateCoverImage({
        filename: 'cover.png',
        mimetype: 'image/png',
        buffer: Buffer.from([0xff, 0xd8, 0xff]),
      }),
    ).toThrow('formatla uyuşmuyor');
  });
});

describe('normalizeCoverImageAlt', () => {
  it('trims alt text and rejects values over the public limit', () => {
    expect(normalizeCoverImageAlt('  Sakin bir göl  ')).toBe('Sakin bir göl');
    expect(normalizeCoverImageAlt('   ')).toBeNull();
    expect(() => normalizeCoverImageAlt('a'.repeat(501))).toThrow('500 karakter');
  });
});
