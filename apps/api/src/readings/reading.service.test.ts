import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { parseReadingMarkdown, plainTextToReadingMarkdown } from './reading.service.js';

const sample = `# Gecenin İçinden Doğan Sabah

## Bodhi Ağacının Altında

İlk bölümde beden, nefes ve orta yol anlatılıyor. ${'nefes '.repeat(60)}

## Māra’nın İlk Sesi

İkinci bölümde kuşku beliriyor. ${'kuşku '.repeat(40)}

## Arzunun Ordusu

Üçüncü bölüm arzuyu ele alıyor. ${'arzu '.repeat(50)}

## Korkunun Ordusu

Dördüncü bölüm korkuyu anlatıyor. ${'korku '.repeat(50)}

## Gecenin Üç Nöbeti

Beşinci bölüm kavrayışın aşamalarını anlatıyor. ${'görmek '.repeat(70)}

## İlk Sözler

Son bölüm sabahı anlatıyor. ${'uyanış '.repeat(30)}
`;

describe('reading Markdown parser', () => {
  it('preserves the document title and creates the requested number of ordered sections', () => {
    const result = parseReadingMarkdown(Buffer.from(sample), 5);

    expect(result.title).toBe('Gecenin İçinden Doğan Sabah');
    expect(result.sections).toHaveLength(5);
    expect(result.sections.map((section) => section.position)).toEqual([1, 2, 3, 4, 5]);
    expect(result.sections.every((section) => section.wordCount > 0)).toBe(true);
    expect(result.sections.map((section) => section.contentMarkdown).join('\n')).toContain(
      'Son bölüm sabahı anlatıyor.',
    );
  });

  it('keeps all content when the requested section count exceeds the heading count', () => {
    const result = parseReadingMarkdown(Buffer.from('# Başlık\n\nTek parça içerik.'), 12);

    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]).toMatchObject({
      title: 'Başlık',
      contentMarkdown: 'Tek parça içerik.',
    });
  });

  it('turns extracted PDF text into the requested number of readable sections', () => {
    const extractedText = Array.from(
      { length: 20 },
      (_, index) =>
        `Paragraf ${index + 1}. ${'Aydınlanma gecesini anlatan okunabilir metin. '.repeat(12)}`,
    ).join('\n\n');

    const markdown = plainTextToReadingMarkdown('Aydınlanma Gecesi', extractedText, 5);
    const parsed = parseReadingMarkdown(Buffer.from(markdown), 5);

    expect(parsed.title).toBe('Aydınlanma Gecesi');
    expect(parsed.sections).toHaveLength(5);
    expect(parsed.sections.every((section) => section.wordCount > 0)).toBe(true);
    expect(parsed.sections.map((section) => section.contentMarkdown).join('\n')).toContain(
      'Paragraf 20.',
    );
  });

  it.each([
    ['empty content', Buffer.alloc(0)],
    ['blank content', Buffer.from('   \n')],
    ['oversized content', Buffer.alloc(5 * 1024 * 1024 + 1)],
  ])('rejects %s', (_name, buffer) => {
    expect(() => parseReadingMarkdown(buffer)).toThrow(BadRequestException);
  });
});
