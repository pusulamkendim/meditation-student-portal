import { BadRequestException } from '@nestjs/common';

export const MAX_COVER_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_COVER_IMAGE_ALT_LENGTH = 500;

const COVER_IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

export type CoverImageUpload = {
  filename: string;
  mimetype: string;
  buffer: Buffer;
};

export type ValidatedCoverImage = {
  extension: (typeof COVER_IMAGE_TYPES)[keyof typeof COVER_IMAGE_TYPES];
  contentType: keyof typeof COVER_IMAGE_TYPES;
};

export function normalizeCoverImageAlt(value: string | null | undefined) {
  if (value === undefined || value === null) return value;
  const normalized = value.trim();
  if (normalized.length > MAX_COVER_IMAGE_ALT_LENGTH)
    throw new BadRequestException('Kapak görseli alt metni 500 karakteri aşamaz.');
  return normalized || null;
}

export function validateCoverImage(input: CoverImageUpload): ValidatedCoverImage {
  if (!input.buffer.byteLength) throw new BadRequestException('Kapak görseli boş olamaz.');
  if (input.buffer.byteLength > MAX_COVER_IMAGE_BYTES)
    throw new BadRequestException('Kapak görseli 8 MiB sınırını aşıyor.');

  const contentType = input.mimetype.toLocaleLowerCase('en-US') as keyof typeof COVER_IMAGE_TYPES;
  const extension = COVER_IMAGE_TYPES[contentType];
  if (!extension)
    throw new BadRequestException('Yalnızca JPEG, PNG veya WebP kapak görseli yükleyin.');

  const isJpeg =
    input.buffer.byteLength >= 3 &&
    input.buffer[0] === 0xff &&
    input.buffer[1] === 0xd8 &&
    input.buffer[2] === 0xff;
  const isPng =
    input.buffer.byteLength >= 8 &&
    input.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isWebp =
    input.buffer.byteLength >= 12 &&
    input.buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    input.buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  const matches =
    (contentType === 'image/jpeg' && isJpeg) ||
    (contentType === 'image/png' && isPng) ||
    (contentType === 'image/webp' && isWebp);
  if (!matches)
    throw new BadRequestException('Kapak görselinin içeriği seçilen formatla uyuşmuyor.');

  return { extension, contentType };
}
