import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import {
  parseReadingMarkdown,
  plainTextToReadingMarkdown,
  ReadingService,
  serializeReadingMarkdown,
} from './reading.service.js';

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

  it('uses the first H2 as the title for a grouped section', () => {
    const result = parseReadingMarkdown(
      Buffer.from(`# Makale\n\n## Giriş\n\nA\n\n## Orta\n\nB\n\n## Son Söz\n\nC`),
      1,
    );

    expect(result.sections).toHaveLength(1);
    expect(result.sections[0]!.title).toBe('Giriş');
    expect(result.sections[0]!.title).not.toContain(' – ');
    expect(result.sections[0]!.contentMarkdown).toContain('### Orta');
    expect(result.sections[0]!.contentMarkdown).toContain('### Son Söz');
  });

  it('uses the first H2 title independently for each grouped section', () => {
    const result = parseReadingMarkdown(
      Buffer.from(
        '# Makale\n\n## Birinci\n\nA\n\n## İkinci\n\nB\n\n## Üçüncü\n\nC\n\n## Dördüncü\n\nD',
      ),
      2,
    );

    expect(result.sections.map((section) => section.title)).toEqual(['Birinci', 'Üçüncü']);
    expect(result.sections.every((section) => !section.title.includes(' – '))).toBe(true);
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

  it('serializes edited sections back to canonical Markdown', () => {
    const result = serializeReadingMarkdown('Başlangıç', [
      { title: 'İlk adım', contentMarkdown: 'Nefesi **olduğu gibi** gözlemle.' },
      { title: 'Dönüş', contentMarkdown: 'Dikkat dağıldığında yeniden dön.' },
    ]).toString('utf8');

    expect(result).toBe(
      '# Başlangıç\n\n## İlk adım\n\nNefesi **olduğu gibi** gözlemle.\n\n## Dönüş\n\nDikkat dağıldığında yeniden dön.\n',
    );
  });
});

describe('reading content updates', () => {
  it('replaces the stored source and sections without changing the reading identity', async () => {
    const sections = [
      {
        id: '10000000-0000-4000-8000-000000000001',
        readingId: '20000000-0000-4000-8000-000000000001',
        position: 1,
        title: 'Eski başlık',
        contentMarkdown: 'Eski içerik.',
        wordCount: 2,
      },
    ];
    const current = {
      id: '20000000-0000-4000-8000-000000000001',
      title: 'Meditasyona Giriş',
      version: 3,
      sourceFilename: 'meditasyona-giris.md',
      sourceStorageKey: 'readings/old.md',
      sourceHash: 'old-hash',
      sourceByteSize: 12,
      sections,
    };
    const updatedDetail = {
      ...current,
      version: 4,
      sections: [
        {
          ...sections[0],
          title: 'Yeni başlık',
          contentMarkdown: 'Yeni ve daha açık içerik.',
          wordCount: 5,
        },
      ],
      assignments: [],
      publicShare: null,
    };
    const tx = {
      reading: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      readingSection: { update: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      reading: {
        findUnique: vi.fn().mockResolvedValueOnce(current).mockResolvedValueOnce(updatedDetail),
      },
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const storage = {
      put: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    const key = Buffer.alloc(32, 7).toString('base64');
    const service = new ReadingService(
      prisma as never,
      {
        DATA_ENCRYPTION_KEYS_JSON: JSON.stringify({ 'test-key': key }),
        ACTIVE_DATA_KEY_ID: 'test-key',
        LOOKUP_HMAC_KEY: key,
        R2_PRIVATE_BUCKET: 'private',
      } as never,
      storage as never,
      {} as never,
      { now: () => new Date('2026-08-30T12:00:00.000Z') } as never,
    );

    const result = await service.updateContent(
      current.id,
      {
        expectedVersion: 3,
        sections: [
          {
            id: sections[0]!.id,
            title: 'Yeni başlık',
            contentMarkdown: 'Yeni ve daha açık içerik.',
          },
        ],
      },
      '30000000-0000-4000-8000-000000000001',
    );

    expect(result.version).toBe(4);
    expect(storage.put).toHaveBeenCalledWith(
      'private',
      expect.stringMatching(/^readings\/.+\/source-.+\.md$/u),
      expect.any(Buffer),
      'text/markdown; charset=utf-8',
    );
    expect(tx.readingSection.update).toHaveBeenCalledWith({
      where: { id: sections[0]!.id },
      data: {
        title: 'Yeni başlık',
        contentMarkdown: 'Yeni ve daha açık içerik.',
        wordCount: 5,
      },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'READING_CONTENT_UPDATED' }),
      }),
    );
    expect(storage.remove).toHaveBeenCalledWith('private', 'readings/old.md');
  });

  it('removes the replacement source when an optimistic-lock conflict aborts the update', async () => {
    const section = {
      id: '10000000-0000-4000-8000-000000000001',
      readingId: '20000000-0000-4000-8000-000000000001',
      position: 1,
      title: 'Eski başlık',
      contentMarkdown: 'Eski içerik.',
      wordCount: 2,
    };
    const current = {
      id: section.readingId,
      title: 'Meditasyona Giriş',
      version: 3,
      sourceFilename: 'meditasyona-giris.md',
      sourceStorageKey: 'readings/old.md',
      sourceHash: 'old-hash',
      sourceByteSize: 12,
      sections: [section],
    };
    const tx = {
      reading: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    };
    const prisma = {
      reading: { findUnique: vi.fn().mockResolvedValue(current) },
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const storage = {
      put: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    const key = Buffer.alloc(32, 7).toString('base64');
    const service = new ReadingService(
      prisma as never,
      {
        DATA_ENCRYPTION_KEYS_JSON: JSON.stringify({ 'test-key': key }),
        ACTIVE_DATA_KEY_ID: 'test-key',
        LOOKUP_HMAC_KEY: key,
        R2_PRIVATE_BUCKET: 'private',
      } as never,
      storage as never,
      {} as never,
      { now: () => new Date('2026-08-30T12:00:00.000Z') } as never,
    );

    await expect(
      service.updateContent(
        current.id,
        {
          expectedVersion: 3,
          sections: [
            {
              id: section.id,
              title: 'Yeni başlık',
              contentMarkdown: 'Yeni içerik.',
            },
          ],
        },
        '30000000-0000-4000-8000-000000000001',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(storage.put).toHaveBeenCalledOnce();
    expect(storage.remove).toHaveBeenCalledWith(
      'private',
      expect.stringMatching(/^readings\/.+\/source-.+\.md$/u),
    );
    expect(storage.remove).not.toHaveBeenCalledWith('private', 'readings/old.md');
  });
});
