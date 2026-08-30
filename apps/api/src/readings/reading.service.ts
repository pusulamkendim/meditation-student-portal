import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CLOCK_TOKEN,
  contentHash,
  FieldEncryption,
  LookupHmac,
  type ApplicationConfig,
  type Clock,
} from '@meditation/core';
import {
  Prisma,
  ReadingAssignmentStatus,
  ReadingPublicShareStatus,
  ReadingStatus,
} from '@meditation/database';
import { marked, type Token } from 'marked';
import { randomBytes, randomUUID } from 'node:crypto';
import pdfParse from 'pdf-parse';

import { APPLICATION_CONFIG } from '../config/application-config.module.js';
import {
  normalizeCoverImageAlt,
  type CoverImageUpload,
  validateCoverImage,
} from '../content-images/cover-image.js';
import { PrismaService } from '../database/prisma.service.js';
import { type ObjectStorage, R2ObjectStorage } from '../knowledge/storage.js';
import { SystemMessageOrchestrator } from '../message-catalog/system-message-orchestrator.js';

const MAX_MARKDOWN_BYTES = 5 * 1024 * 1024;
const MAX_PDF_BYTES = 25 * 1024 * 1024;
const MAX_RESPONSE_LENGTH = 4_000;
const PUBLIC_READER_ACTIVE_WINDOW_MS = 5 * 60 * 1_000;

type ReadingUpload = {
  markdown?: { filename: string; mimetype: string; buffer: Buffer };
  pdf?: { filename: string; mimetype: string; buffer: Buffer };
  coverImage?: CoverImageUpload;
  coverImageAlt?: string;
  title?: string;
  description?: string;
  author?: string;
  targetSectionCount: number;
  estimatedMinutes?: number;
  allowAgent: boolean;
};

type PublicShareSettings = {
  slug: string;
  allowPdf: boolean;
  allowIndexing: boolean;
  expiresAt: Date | null;
};

type PublicAttribution = {
  source?: string;
  medium?: string;
  campaign?: string;
};

type ParsedSection = {
  position: number;
  title: string;
  contentMarkdown: string;
  wordCount: number;
};

type EditableReadingSection = {
  id: string;
  title: string;
  contentMarkdown: string;
};

type MarkdownUnit = {
  title: string;
  body: string;
  wordCount: number;
};

export const READING_STORAGE = Symbol('READING_STORAGE');

export function createReadingStorage(config: ApplicationConfig): ObjectStorage {
  return new R2ObjectStorage(config);
}

export function parseReadingMarkdown(
  buffer: Buffer,
  targetSectionCount = 5,
): { title?: string; sections: ParsedSection[]; wordCount: number } {
  if (!buffer.byteLength) throw new BadRequestException('Markdown dosyası boş olamaz.');
  if (buffer.byteLength > MAX_MARKDOWN_BYTES)
    throw new BadRequestException('Markdown dosyası 5 MiB sınırını aşıyor.');
  const markdown = buffer.toString('utf8').replace(/\r\n/g, '\n').trim();
  if (!markdown) throw new BadRequestException('Markdown dosyasında okunabilir metin bulunamadı.');

  const tokens = marked.lexer(markdown);
  const documentTitle = tokens.find(
    (token): token is Extract<Token, { type: 'heading' }> =>
      token.type === 'heading' && token.depth === 1,
  )?.text;
  const units: MarkdownUnit[] = [];
  let current: { title: string; parts: string[] } | undefined;
  const preamble: string[] = [];

  for (const token of tokens) {
    if (token.type === 'heading' && token.depth === 1) continue;
    if (token.type === 'heading' && token.depth === 2) {
      if (current) units.push(toUnit(current));
      current = { title: token.text.trim(), parts: [] };
      continue;
    }
    const raw = token.raw?.trim();
    if (!raw) continue;
    if (current) current.parts.push(raw);
    else preamble.push(raw);
  }
  if (current) units.push(toUnit(current));
  if (!units.length) {
    const content = preamble.join('\n\n').trim();
    units.push({
      title: documentTitle?.trim() || 'Okuma',
      body: content,
      wordCount: countWords(content),
    });
  } else if (preamble.length) {
    const prefix = preamble.join('\n\n').trim();
    units[0] = {
      ...units[0]!,
      body: `${prefix}\n\n${units[0]!.body}`.trim(),
      wordCount: countWords(`${prefix}\n\n${units[0]!.body}`),
    };
  }

  const groups = groupUnits(units, targetSectionCount);
  const sections = groups.map((group, index) => {
    const title = group[0]!.title;
    const contentMarkdown = group
      .map((unit, unitIndex) => (unitIndex === 0 ? unit.body : `### ${unit.title}\n\n${unit.body}`))
      .join('\n\n')
      .trim();
    return {
      position: index + 1,
      title: title.slice(0, 240),
      contentMarkdown,
      wordCount: group.reduce((sum, unit) => sum + unit.wordCount, 0),
    };
  });
  return {
    title: documentTitle?.trim(),
    sections,
    wordCount: sections.reduce((sum, section) => sum + section.wordCount, 0),
  };
}

export function plainTextToReadingMarkdown(
  title: string,
  text: string,
  targetSectionCount = 5,
): string {
  const normalized = text
    .replace(/\r\n?/gu, '\n')
    .replace(/[ \t]+\n/gu, '\n')
    .trim();
  if (!normalized) throw new BadRequestException('PDF dosyasında okunabilir metin bulunamadı.');
  let blocks = normalized
    .split(/\n\s*\n/gu)
    .map((block) => block.replace(/\s*\n\s*/gu, ' ').trim())
    .filter(Boolean);
  if (blocks.length < targetSectionCount)
    blocks = normalized
      .split(/\n+/gu)
      .map((block) => block.trim())
      .filter(Boolean);
  if (blocks.length < targetSectionCount) {
    const words = normalized.split(/\s+/gu);
    const wordsPerBlock = Math.max(1, Math.ceil(words.length / targetSectionCount));
    blocks = Array.from({ length: targetSectionCount }, (_, index) =>
      words.slice(index * wordsPerBlock, (index + 1) * wordsPerBlock).join(' '),
    ).filter(Boolean);
  }
  const units = blocks.map((body, index) => ({
    title: `Metin ${index + 1}`,
    body,
    wordCount: countWords(body),
  }));
  const groups = groupUnits(units, targetSectionCount);
  return [
    `# ${title}`,
    ...groups.map(
      (group, index) => `## Bölüm ${index + 1}\n\n${group.map((unit) => unit.body).join('\n\n')}`,
    ),
  ].join('\n\n');
}

function toUnit(input: { title: string; parts: string[] }): MarkdownUnit {
  const body = input.parts.join('\n\n').trim();
  return { title: input.title || 'Bölüm', body, wordCount: countWords(body) };
}

function countWords(value: string): number {
  return value.match(/[\p{Letter}\p{Number}]+(?:['’][\p{Letter}\p{Number}]+)*/gu)?.length ?? 0;
}

export function serializeReadingMarkdown(
  title: string,
  sections: Array<Pick<EditableReadingSection, 'title' | 'contentMarkdown'>>,
): Buffer {
  const markdown = [
    `# ${normalizeTitle(title)}`,
    ...sections.map(
      (section) =>
        `## ${normalizeSectionTitle(section.title)}\n\n${normalizeSectionContent(section.contentMarkdown)}`,
    ),
  ].join('\n\n');
  const buffer = Buffer.from(`${markdown.trim()}\n`, 'utf8');
  if (buffer.byteLength > MAX_MARKDOWN_BYTES)
    throw new BadRequestException('Markdown dosyası 5 MiB sınırını aşıyor.');
  return buffer;
}

function groupUnits(units: MarkdownUnit[], requestedGroups: number): MarkdownUnit[][] {
  const groupCount = Math.max(1, Math.min(Math.trunc(requestedGroups), units.length));
  const groups: MarkdownUnit[][] = [];
  let cursor = 0;
  let remainingWords = units.reduce((sum, unit) => sum + Math.max(1, unit.wordCount), 0);
  for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
    const groupsLeft = groupCount - groupIndex;
    const unitsLeft = units.length - cursor;
    const targetWords = remainingWords / groupsLeft;
    const maximumUnits = unitsLeft - (groupsLeft - 1);
    const group: MarkdownUnit[] = [];
    let words = 0;
    while (group.length < maximumUnits) {
      const unit = units[cursor]!;
      group.push(unit);
      cursor += 1;
      words += Math.max(1, unit.wordCount);
      if (words >= targetWords) break;
    }
    groups.push(group);
    remainingWords -= words;
  }
  return groups;
}

@Injectable()
export class ReadingService {
  private readonly logger = new Logger(ReadingService.name);
  private readonly encryption: FieldEncryption;
  private readonly lookup: LookupHmac;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(APPLICATION_CONFIG) private readonly config: ApplicationConfig,
    @Inject(READING_STORAGE) private readonly storage: ObjectStorage,
    @Inject(SystemMessageOrchestrator) private readonly messages: SystemMessageOrchestrator,
    @Inject(CLOCK_TOKEN) private readonly clock: Clock,
  ) {
    if (!config.DATA_ENCRYPTION_KEYS_JSON || !config.ACTIVE_DATA_KEY_ID || !config.LOOKUP_HMAC_KEY)
      throw new Error('Reading encryption and lookup keys are required.');
    const keys = JSON.parse(config.DATA_ENCRYPTION_KEYS_JSON) as Record<string, string>;
    this.encryption = new FieldEncryption(
      new Map(Object.entries(keys).map(([id, key]) => [id, Buffer.from(key, 'base64')])),
      config.ACTIVE_DATA_KEY_ID,
    );
    this.lookup = new LookupHmac(Buffer.from(config.LOOKUP_HMAC_KEY, 'base64'));
  }

  async list() {
    const rows = await this.prisma.reading.findMany({
      include: {
        _count: { select: { sections: true, assignments: true } },
        assignments: { select: { status: true } },
        publicShare: {
          select: { id: true, slug: true, status: true, expiresAt: true },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { title: 'asc' }],
      take: 250,
    });
    return rows.map(({ assignments, ...reading }) => ({
      ...reading,
      assignmentCounts: countAssignmentStatuses(assignments),
    }));
  }

  async detail(id: string) {
    const reading = await this.prisma.reading.findUnique({
      where: { id },
      include: {
        sections: { orderBy: { position: 'asc' } },
        assignments: {
          orderBy: { assignedAt: 'desc' },
          include: {
            student: {
              select: { id: true, fullNameEncrypted: true, fullNameKeyId: true, status: true },
            },
            messageIntent: { select: { status: true, suppressionReason: true } },
          },
        },
        publicShare: {
          select: {
            id: true,
            slug: true,
            status: true,
            allowPdf: true,
            allowIndexing: true,
            expiresAt: true,
            version: true,
          },
        },
      },
    });
    if (!reading) throw new NotFoundException('Okuma bulunamadı.');
    return {
      ...reading,
      assignments: reading.assignments.map(({ student, ...assignment }) => ({
        ...assignment,
        student: {
          id: student.id,
          status: student.status,
          fullName: this.decryptStudentName(
            student.id,
            student.fullNameEncrypted,
            student.fullNameKeyId,
          ),
        },
        response: this.decryptResponse(assignment),
      })),
    };
  }

  async upload(input: ReadingUpload, adminId: string) {
    validateUpload(input);
    const coverImage = input.coverImage ? validateCoverImage(input.coverImage) : undefined;
    const coverImageAlt = normalizeCoverImageAlt(input.coverImageAlt);
    let markdown = input.markdown;
    if (!markdown && input.pdf) {
      const parsedPdf = await pdfParse(input.pdf.buffer);
      const generatedTitle =
        input.title?.trim() || titleFromFilename(input.pdf.filename.replace(/\.pdf$/iu, '.md'));
      const generatedMarkdown = plainTextToReadingMarkdown(
        generatedTitle,
        parsedPdf.text,
        input.targetSectionCount,
      );
      markdown = {
        filename: input.pdf.filename.replace(/\.pdf$/iu, '.md'),
        mimetype: 'text/markdown',
        buffer: Buffer.from(generatedMarkdown),
      };
    }
    if (!markdown) throw new BadRequestException('Markdown veya PDF dosyası seçin.');
    const parsed = parseReadingMarkdown(markdown.buffer, input.targetSectionCount);
    const id = randomUUID();
    const sourceKey = `readings/${id}/source-${randomUUID()}.md`;
    const pdfKey = input.pdf ? `readings/${id}/document-${randomUUID()}.pdf` : undefined;
    const coverKey = input.coverImage
      ? `readings/${id}/cover-${randomUUID()}.${coverImage!.extension}`
      : undefined;
    try {
      await this.storage.put(
        this.config.R2_PRIVATE_BUCKET,
        sourceKey,
        markdown.buffer,
        'text/markdown; charset=utf-8',
      );
      if (input.pdf && pdfKey)
        await this.storage.put(
          this.config.R2_PRIVATE_BUCKET,
          pdfKey,
          input.pdf.buffer,
          'application/pdf',
        );
      if (input.coverImage && coverKey)
        await this.storage.put(
          this.config.R2_PRIVATE_BUCKET,
          coverKey,
          input.coverImage.buffer,
          coverImage!.contentType,
        );
      return await this.prisma.$transaction(async (tx) => {
        const reading = await tx.reading.create({
          data: {
            id,
            title: input.title?.trim() || parsed.title || titleFromFilename(markdown.filename),
            description: input.description?.trim() || null,
            author: input.author?.trim() || null,
            estimatedMinutes:
              input.estimatedMinutes ?? Math.max(1, Math.ceil(parsed.wordCount / 220)),
            allowAgent: input.allowAgent,
            sourceFilename: markdown.filename,
            sourceStorageKey: sourceKey,
            sourceHash: contentHash(markdown.buffer),
            sourceByteSize: markdown.buffer.byteLength,
            pdfFilename: input.pdf?.filename,
            pdfStorageKey: pdfKey,
            pdfHash: input.pdf ? contentHash(input.pdf.buffer) : undefined,
            pdfByteSize: input.pdf?.buffer.byteLength,
            coverImageStorageKey: coverKey,
            coverImageMimeType: coverImage?.contentType,
            coverImageAlt: coverImageAlt ?? null,
            coverImageByteSize: input.coverImage?.buffer.byteLength,
            coverImageHash: input.coverImage ? contentHash(input.coverImage.buffer) : undefined,
            createdByAdminId: adminId,
            updatedByAdminId: adminId,
            sections: {
              create: parsed.sections.map((section) => ({
                position: section.position,
                title: section.title,
                contentMarkdown: section.contentMarkdown,
                wordCount: section.wordCount,
              })),
            },
          },
          include: { sections: { orderBy: { position: 'asc' } } },
        });
        await this.audit(tx, 'ADMIN', adminId, 'READING_CREATED', reading.id, {
          title: reading.title,
          sections: reading.sections.length,
          words: parsed.wordCount,
          pdfAttached: Boolean(input.pdf),
          coverImageAttached: Boolean(input.coverImage),
        });
        return reading;
      });
    } catch (error) {
      await Promise.all([
        this.removeStorageObject(sourceKey, 'Okuma kaynağı temizlenemedi'),
        this.removeStorageObject(pdfKey, 'Okuma PDF kaynağı temizlenemedi'),
        this.removeStorageObject(coverKey, 'Okuma kapak görseli temizlenemedi'),
      ]);
      throw error;
    }
  }

  async update(
    id: string,
    input: {
      expectedVersion: number;
      title?: string;
      description?: string | null;
      author?: string | null;
      estimatedMinutes?: number;
      allowAgent?: boolean;
      status?: ReadingStatus;
      coverImageAlt?: string | null;
    },
    adminId: string,
  ) {
    const current = await this.prisma.reading.findUnique({
      where: { id },
      include: { _count: { select: { sections: true } } },
    });
    if (!current) throw new NotFoundException('Okuma bulunamadı.');
    if (input.status === ReadingStatus.PUBLISHED && current._count.sections === 0)
      throw new BadRequestException('Bölümü olmayan bir okuma yayınlanamaz.');
    const changed = await this.prisma.$transaction(async (tx) => {
      const result = await tx.reading.updateMany({
        where: { id, version: input.expectedVersion },
        data: {
          ...(input.title !== undefined ? { title: normalizeTitle(input.title) } : {}),
          ...(input.description !== undefined
            ? { description: input.description?.trim() || null }
            : {}),
          ...(input.author !== undefined ? { author: input.author?.trim() || null } : {}),
          ...(input.estimatedMinutes !== undefined
            ? { estimatedMinutes: input.estimatedMinutes }
            : {}),
          ...(input.allowAgent !== undefined ? { allowAgent: input.allowAgent } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.coverImageAlt !== undefined
            ? { coverImageAlt: normalizeCoverImageAlt(input.coverImageAlt) }
            : {}),
          updatedByAdminId: adminId,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1)
        throw new ConflictException(
          'Okuma başka bir oturumda güncellendi. Sayfayı yenileyip tekrar deneyin.',
        );
      await this.audit(tx, 'ADMIN', adminId, 'READING_UPDATED', id, {
        status: input.status,
        metadataUpdated: Object.keys(input).length > 2,
      });
      return tx.reading.findUniqueOrThrow({ where: { id } });
    });
    return changed;
  }

  async updateContent(
    id: string,
    input: { expectedVersion: number; sections: EditableReadingSection[] },
    adminId: string,
  ) {
    const current = await this.prisma.reading.findUnique({
      where: { id },
      include: { sections: { orderBy: { position: 'asc' } } },
    });
    if (!current) throw new NotFoundException('Okuma bulunamadı.');
    if (current.version !== input.expectedVersion)
      throw new ConflictException(
        'Okuma başka bir oturumda güncellendi. Sayfayı yenileyip tekrar deneyin.',
      );
    if (input.sections.length !== current.sections.length)
      throw new BadRequestException('Bu ekrandan bölüm eklenemez veya kaldırılamaz.');

    const inputById = new Map(input.sections.map((section) => [section.id, section]));
    if (inputById.size !== input.sections.length)
      throw new BadRequestException('Aynı bölüm birden fazla kez gönderilemez.');
    const sections = current.sections.map((section) => {
      const changed = inputById.get(section.id);
      if (!changed) throw new BadRequestException('Okumaya ait tüm bölümler gönderilmelidir.');
      const title = normalizeSectionTitle(changed.title);
      const contentMarkdown = normalizeSectionContent(changed.contentMarkdown);
      const wordCount = countWords(contentMarkdown);
      if (wordCount === 0) throw new BadRequestException('Okuma bölümü boş bırakılamaz.');
      return { ...section, title, contentMarkdown, wordCount };
    });
    if (inputById.size !== current.sections.length)
      throw new BadRequestException('Başka bir okumaya ait bölüm gönderilemez.');

    const source = serializeReadingMarkdown(current.title, sections);
    const sourceHash = contentHash(source);
    if (sourceHash === current.sourceHash) return this.detail(id);
    const storageKey = `readings/${id}/source-${randomUUID()}.md`;
    await this.storage.put(
      this.config.R2_PRIVATE_BUCKET,
      storageKey,
      source,
      'text/markdown; charset=utf-8',
    );
    try {
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.reading.updateMany({
          where: { id, version: input.expectedVersion },
          data: {
            sourceFilename: current.sourceFilename.replace(/\.(?:md|markdown)$/iu, '.md'),
            sourceStorageKey: storageKey,
            sourceHash,
            sourceByteSize: source.byteLength,
            updatedByAdminId: adminId,
            version: { increment: 1 },
          },
        });
        if (claimed.count !== 1)
          throw new ConflictException(
            'Okuma başka bir oturumda güncellendi. Sayfayı yenileyip tekrar deneyin.',
          );
        for (const section of sections) {
          await tx.readingSection.update({
            where: { id: section.id },
            data: {
              title: section.title,
              contentMarkdown: section.contentMarkdown,
              wordCount: section.wordCount,
            },
          });
        }
        await this.audit(tx, 'ADMIN', adminId, 'READING_CONTENT_UPDATED', id, {
          previousSourceHash: current.sourceHash,
          sourceHash,
          changedSectionIds: sections
            .filter((section, index) => {
              const previous = current.sections[index]!;
              return (
                section.title !== previous.title ||
                section.contentMarkdown !== previous.contentMarkdown
              );
            })
            .map((section) => section.id),
          previousWordCount: current.sections.reduce(
            (total, section) => total + section.wordCount,
            0,
          ),
          wordCount: sections.reduce((total, section) => total + section.wordCount, 0),
        });
      });
    } catch (error) {
      await this.removeStorageObject(storageKey, 'Yeni okuma kaynağı temizlenemedi');
      throw error;
    }
    await this.removeStorageObject(current.sourceStorageKey, 'Eski okuma kaynağı silinemedi');
    return this.detail(id);
  }

  async remove(id: string, adminId: string) {
    const reading = await this.prisma.reading.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        sourceStorageKey: true,
        pdfStorageKey: true,
        coverImageStorageKey: true,
        _count: { select: { assignments: true } },
        publicShare: { select: { id: true } },
      },
    });
    if (!reading) throw new NotFoundException('Okuma bulunamadı.');
    if (reading._count.assignments > 0)
      throw new ConflictException(
        'Öğrenciye atanmış bir okuma kalıcı olarak silinemez. Okumayı arşivleyebilirsiniz.',
      );
    if (reading.publicShare)
      throw new ConflictException(
        'Herkese açık bağlantısı bulunan bir okuma kalıcı olarak silinemez. Okumayı arşivleyebilirsiniz.',
      );

    await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.reading.deleteMany({
        where: { id, assignments: { none: {} }, publicShare: null },
      });
      if (deleted.count !== 1)
        throw new ConflictException(
          'Okuma bu sırada bir öğrenciye atandı ve silinemedi. Sayfayı yenileyin.',
        );
      await this.audit(tx, 'ADMIN', adminId, 'READING_DELETED', id, {
        title: reading.title,
        pdfAttached: Boolean(reading.pdfStorageKey),
        coverImageAttached: Boolean(reading.coverImageStorageKey),
      });
    });

    await Promise.all([
      this.removeStorageObject(reading.sourceStorageKey, 'Okuma kaynağı silinemedi'),
      this.removeStorageObject(reading.pdfStorageKey, 'Okuma PDF kaynağı silinemedi'),
      this.removeStorageObject(reading.coverImageStorageKey, 'Okuma kapak görseli silinemedi'),
    ]);
    return { id, deleted: true };
  }

  async uploadCoverImage(
    id: string,
    file: CoverImageUpload,
    alt: string | undefined,
    expectedVersion: number,
    adminId: string,
  ) {
    const validated = validateCoverImage(file);
    const current = await this.prisma.reading.findUnique({
      where: { id },
      select: { version: true, coverImageStorageKey: true },
    });
    if (!current) throw new NotFoundException('Okuma bulunamadı.');
    const storageKey = `readings/${id}/cover-${randomUUID()}.${validated.extension}`;
    const hash = contentHash(file.buffer);
    await this.storage.put(
      this.config.R2_PRIVATE_BUCKET,
      storageKey,
      file.buffer,
      validated.contentType,
    );
    try {
      await this.prisma.$transaction(async (tx) => {
        const changed = await tx.reading.updateMany({
          where: { id, version: expectedVersion },
          data: {
            coverImageStorageKey: storageKey,
            coverImageMimeType: validated.contentType,
            coverImageAlt: normalizeCoverImageAlt(alt) ?? null,
            coverImageByteSize: file.buffer.byteLength,
            coverImageHash: hash,
            updatedByAdminId: adminId,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1)
          throw new ConflictException(
            'Okuma başka bir oturumda güncellendi. Sayfayı yenileyip tekrar deneyin.',
          );
        await this.audit(tx, 'ADMIN', adminId, 'READING_COVER_IMAGE_UPDATED', id, {
          contentType: validated.contentType,
          byteSize: file.buffer.byteLength,
          contentHash: hash,
        });
      });
    } catch (error) {
      await this.removeStorageObject(storageKey, 'Yeni okuma kapak görseli temizlenemedi');
      throw error;
    }
    await this.removeStorageObject(
      current.coverImageStorageKey,
      'Eski okuma kapak görseli silinemedi',
    );
    return { id, updated: true };
  }

  async removeCoverImage(id: string, expectedVersion: number, adminId: string) {
    const current = await this.prisma.reading.findUnique({
      where: { id },
      select: { version: true, coverImageStorageKey: true },
    });
    if (!current) throw new NotFoundException('Okuma bulunamadı.');
    const changed = await this.prisma.$transaction(async (tx) => {
      const result = await tx.reading.updateMany({
        where: { id, version: expectedVersion },
        data: {
          coverImageStorageKey: null,
          coverImageMimeType: null,
          coverImageAlt: null,
          coverImageByteSize: null,
          coverImageHash: null,
          updatedByAdminId: adminId,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1)
        throw new ConflictException(
          'Okuma başka bir oturumda güncellendi. Sayfayı yenileyip tekrar deneyin.',
        );
      await this.audit(tx, 'ADMIN', adminId, 'READING_COVER_IMAGE_REMOVED', id, {});
      return result;
    });
    await this.removeStorageObject(current.coverImageStorageKey, 'Okuma kapak görseli silinemedi');
    return { id, removed: changed.count === 1 };
  }

  async image(id: string) {
    const reading = await this.prisma.reading.findUnique({
      where: { id },
      select: { coverImageStorageKey: true, coverImageMimeType: true, coverImageHash: true },
    });
    if (!reading) throw new NotFoundException('Okuma bulunamadı.');
    if (!reading.coverImageStorageKey || !reading.coverImageMimeType)
      throw new NotFoundException('Bu okumanın kapak görseli bulunamadı.');
    const buffer = await this.storage.get(
      this.config.R2_PRIVATE_BUCKET,
      reading.coverImageStorageKey,
    );
    return { contentType: reading.coverImageMimeType, buffer, etag: reading.coverImageHash };
  }

  async createPublicShare(readingId: string, input: PublicShareSettings, adminId: string) {
    this.validatePublicShareSettings(input);
    const reading = await this.prisma.reading.findUnique({
      where: { id: readingId },
      select: {
        id: true,
        status: true,
        pdfStorageKey: true,
        publicShare: { select: { id: true } },
      },
    });
    if (!reading) throw new NotFoundException('Okuma bulunamadı.');
    if (reading.status !== ReadingStatus.PUBLISHED)
      throw new BadRequestException('Herkese açık bağlantı için okuma yayında olmalıdır.');
    if (reading.publicShare)
      throw new ConflictException('Bu okuma için zaten herkese açık bir bağlantı var.');
    if (input.allowPdf && !reading.pdfStorageKey)
      throw new BadRequestException('PDF eklenmemiş bir okumada PDF paylaşımı açılamaz.');

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.readingPublicShare.create({
          data: {
            readingId,
            slug: input.slug,
            allowPdf: input.allowPdf,
            allowIndexing: input.allowIndexing,
            expiresAt: input.expiresAt,
            createdByAdminId: adminId,
            updatedByAdminId: adminId,
          },
        });
        await this.audit(tx, 'ADMIN', adminId, 'READING_PUBLIC_SHARE_CREATED', readingId, {
          slug: input.slug,
          allowPdf: input.allowPdf,
          allowIndexing: input.allowIndexing,
          expiresAt: input.expiresAt?.toISOString(),
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('Bu bağlantı adı başka bir okumada kullanılıyor.');
      throw error;
    }
    return this.publicShareDetail(readingId);
  }

  async updatePublicShare(
    readingId: string,
    input: {
      expectedVersion: number;
      slug?: string;
      status?: ReadingPublicShareStatus;
      allowPdf?: boolean;
      allowIndexing?: boolean;
      expiresAt?: Date | null;
    },
    adminId: string,
  ) {
    const current = await this.prisma.readingPublicShare.findUnique({
      where: { readingId },
      include: { reading: { select: { status: true, pdfStorageKey: true } } },
    });
    if (!current) throw new NotFoundException('Herkese açık paylaşım bulunamadı.');
    const effective = {
      slug: input.slug ?? current.slug,
      allowPdf: input.allowPdf ?? current.allowPdf,
      allowIndexing: input.allowIndexing ?? current.allowIndexing,
      expiresAt: input.expiresAt === undefined ? current.expiresAt : input.expiresAt,
    };
    this.validatePublicShareSettings({
      ...effective,
      expiresAt: input.expiresAt === undefined ? null : input.expiresAt,
    });
    if (effective.allowPdf && !current.reading.pdfStorageKey)
      throw new BadRequestException('PDF eklenmemiş bir okumada PDF paylaşımı açılamaz.');
    if (
      input.status === ReadingPublicShareStatus.ACTIVE &&
      current.reading.status !== ReadingStatus.PUBLISHED
    )
      throw new BadRequestException('Arşivdeki veya taslaktaki okuma yeniden açılamaz.');
    if (
      input.status === ReadingPublicShareStatus.ACTIVE &&
      effective.expiresAt !== null &&
      effective.expiresAt <= this.clock.now()
    )
      throw new BadRequestException('Süresi dolmuş paylaşımı açmadan önce tarihi güncelleyin.');

    try {
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.readingPublicShare.updateMany({
          where: { id: current.id, version: input.expectedVersion },
          data: {
            ...(input.slug !== undefined ? { slug: input.slug } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
            ...(input.allowPdf !== undefined ? { allowPdf: input.allowPdf } : {}),
            ...(input.allowIndexing !== undefined ? { allowIndexing: input.allowIndexing } : {}),
            ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
            updatedByAdminId: adminId,
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1)
          throw new ConflictException(
            'Paylaşım başka bir oturumda güncellendi. Sayfayı yenileyip tekrar deneyin.',
          );
        await this.audit(tx, 'ADMIN', adminId, 'READING_PUBLIC_SHARE_UPDATED', readingId, {
          slug: input.slug,
          status: input.status,
          allowPdf: input.allowPdf,
          allowIndexing: input.allowIndexing,
          expiresAt: input.expiresAt?.toISOString(),
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('Bu bağlantı adı başka bir okumada kullanılıyor.');
      throw error;
    }
    return this.publicShareDetail(readingId);
  }

  async publicShareDetail(readingId: string) {
    const share = await this.prisma.readingPublicShare.findUnique({
      where: { readingId },
      include: {
        reading: { select: { title: true, status: true, pdfStorageKey: true } },
      },
    });
    if (!share) throw new NotFoundException('Herkese açık paylaşım bulunamadı.');
    const now = this.clock.now();
    const activeSince = new Date(now.getTime() - PUBLIC_READER_ACTIVE_WINDOW_MS);
    const [aggregate, completedReaders, activeReaders, sourceRows] = await Promise.all([
      this.prisma.readingPublicVisit.aggregate({
        where: { shareId: share.id },
        _count: { _all: true },
        _sum: { viewCount: true, pdfDownloadCount: true, whatsappClickCount: true },
        _avg: { progressPercent: true },
      }),
      this.prisma.readingPublicVisit.count({
        where: { shareId: share.id, completedAt: { not: null } },
      }),
      this.prisma.readingPublicVisit.count({
        where: { shareId: share.id, lastSeenAt: { gte: activeSince }, completedAt: null },
      }),
      this.prisma.readingPublicVisit.groupBy({
        by: ['source', 'medium', 'campaign'],
        where: { shareId: share.id },
        _count: { _all: true },
        _sum: { viewCount: true },
      }),
    ]);
    const uniqueReaders = aggregate._count._all;
    return {
      id: share.id,
      readingId: share.readingId,
      slug: share.slug,
      status: share.status,
      effectiveStatus:
        share.status === ReadingPublicShareStatus.PAUSED
          ? 'PAUSED'
          : share.expiresAt && share.expiresAt <= now
            ? 'EXPIRED'
            : share.reading.status !== ReadingStatus.PUBLISHED
              ? 'READING_UNAVAILABLE'
              : 'ACTIVE',
      allowPdf: share.allowPdf,
      allowIndexing: share.allowIndexing,
      expiresAt: share.expiresAt,
      version: share.version,
      publicUrl: this.publicReadingUrl(share.slug),
      readingTitle: share.reading.title,
      hasPdf: Boolean(share.reading.pdfStorageKey),
      metrics: {
        totalViews: aggregate._sum.viewCount ?? 0,
        totalPdfDownloads: aggregate._sum.pdfDownloadCount ?? 0,
        whatsappClicks: aggregate._sum.whatsappClickCount ?? 0,
        uniqueReaders,
        activeReaders,
        completedReaders,
        completionRate:
          uniqueReaders === 0 ? 0 : Math.round((completedReaders / uniqueReaders) * 100),
        averageProgress: Math.round(aggregate._avg.progressPercent ?? 0),
        sources: sourceRows
          .map((row) => ({
            source: row.source ?? 'direct',
            medium: row.medium,
            campaign: row.campaign,
            uniqueReaders: row._count._all,
            totalViews: row._sum.viewCount ?? 0,
          }))
          .sort((left, right) => right.uniqueReaders - left.uniqueReaders),
      },
    };
  }

  async publicMeta(slug: string) {
    const share = await this.publicShareForSlug(slug);
    return {
      slug: share.slug,
      title: share.reading.title,
      description: share.reading.description,
      author: share.reading.author,
      estimatedMinutes: share.reading.estimatedMinutes,
      sectionCount: share.reading._count.sections,
      allowIndexing: share.allowIndexing,
      canonicalUrl: this.publicReadingUrl(share.slug),
      coverImageUrl: share.reading.coverImageStorageKey
        ? this.publicReadingImagePath(share.slug, share.reading.coverImageHash)
        : null,
      coverImageAlt: share.reading.coverImageAlt ?? null,
    };
  }

  async publicContent(slug: string) {
    const share = await this.publicShareForSlug(slug);
    return {
      slug: share.slug,
      title: share.reading.title,
      description: share.reading.description,
      author: share.reading.author,
      estimatedMinutes: share.reading.estimatedMinutes,
      hasPdf: share.allowPdf && Boolean(share.reading.pdfStorageKey),
      allowIndexing: share.allowIndexing,
      canonicalUrl: this.publicReadingUrl(share.slug),
      coverImageUrl: share.reading.coverImageStorageKey
        ? this.publicReadingImagePath(share.slug, share.reading.coverImageHash)
        : null,
      coverImageAlt: share.reading.coverImageAlt ?? null,
      updatedAt: share.reading.updatedAt.toISOString(),
      sections: share.reading.sections.map((section) => ({
        position: section.position,
        title: section.title,
        contentMarkdown: section.contentMarkdown,
        wordCount: section.wordCount,
      })),
    };
  }

  async publicImage(slug: string) {
    const share = await this.publicShareForSlug(slug);
    const key = share.reading.coverImageStorageKey;
    const contentType = share.reading.coverImageMimeType;
    if (!key || !contentType) throw new NotFoundException('Bu okumanın kapak görseli bulunamadı.');
    const buffer = await this.storage.get(this.config.R2_PRIVATE_BUCKET, key);
    return {
      contentType,
      buffer,
      etag: share.reading.coverImageHash ?? contentHash(buffer),
    };
  }

  async publicAccess(slug: string, visitorId: string, attribution: PublicAttribution) {
    const share = await this.publicShareForSlug(slug);
    const now = this.clock.now();
    const visitorHmac = this.publicVisitorHmac(share.id, visitorId);
    const visit = await this.prisma.readingPublicVisit.upsert({
      where: { shareId_visitorHmac: { shareId: share.id, visitorHmac } },
      create: {
        shareId: share.id,
        visitorHmac,
        source: attribution.source,
        medium: attribution.medium,
        campaign: attribution.campaign,
        firstOpenedAt: now,
        lastSeenAt: now,
      },
      update: { viewCount: { increment: 1 }, lastSeenAt: now },
    });
    return {
      title: share.reading.title,
      description: share.reading.description,
      author: share.reading.author,
      coverImageUrl: share.reading.coverImageStorageKey
        ? this.publicReadingImagePath(share.slug, share.reading.coverImageHash)
        : null,
      coverImageAlt: share.reading.coverImageAlt ?? null,
      estimatedMinutes: share.reading.estimatedMinutes,
      hasPdf: share.allowPdf && Boolean(share.reading.pdfStorageKey),
      sections: share.reading.sections.map((section) => ({
        position: section.position,
        title: section.title,
        contentMarkdown: section.contentMarkdown,
        wordCount: section.wordCount,
      })),
      progress: {
        lastSectionPosition: visit.maxSectionPosition,
        progressPercent: visit.progressPercent,
        completed: Boolean(visit.completedAt),
      },
    };
  }

  async publicProgress(
    slug: string,
    visitorId: string,
    sectionPosition: number,
    progressPercent: number,
  ) {
    const share = await this.publicShareForSlug(slug);
    if (sectionPosition > share.reading._count.sections)
      throw new BadRequestException('Geçersiz okuma bölümü.');
    const visitorHmac = this.publicVisitorHmac(share.id, visitorId);
    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      const visit = await tx.readingPublicVisit.upsert({
        where: { shareId_visitorHmac: { shareId: share.id, visitorHmac } },
        create: {
          shareId: share.id,
          visitorHmac,
          maxSectionPosition: sectionPosition,
          progressPercent,
          firstOpenedAt: now,
          lastSeenAt: now,
        },
        update: { lastSeenAt: now },
      });
      await tx.readingPublicVisit.update({
        where: { id: visit.id },
        data: {
          maxSectionPosition: Math.max(visit.maxSectionPosition, sectionPosition),
          progressPercent: Math.max(visit.progressPercent, progressPercent),
          lastSeenAt: now,
        },
      });
    });
    return { saved: true };
  }

  async publicHeartbeat(slug: string, visitorId: string) {
    const share = await this.publicShareForSlug(slug);
    const updated = await this.prisma.readingPublicVisit.updateMany({
      where: {
        shareId: share.id,
        visitorHmac: this.publicVisitorHmac(share.id, visitorId),
      },
      data: { lastSeenAt: this.clock.now() },
    });
    return { saved: updated.count === 1 };
  }

  async publicComplete(slug: string, visitorId: string) {
    const share = await this.publicShareForSlug(slug);
    const now = this.clock.now();
    await this.prisma.readingPublicVisit.upsert({
      where: {
        shareId_visitorHmac: {
          shareId: share.id,
          visitorHmac: this.publicVisitorHmac(share.id, visitorId),
        },
      },
      create: {
        shareId: share.id,
        visitorHmac: this.publicVisitorHmac(share.id, visitorId),
        maxSectionPosition: share.reading._count.sections,
        progressPercent: 100,
        firstOpenedAt: now,
        lastSeenAt: now,
        completedAt: now,
      },
      update: {
        maxSectionPosition: share.reading._count.sections,
        progressPercent: 100,
        lastSeenAt: now,
        completedAt: now,
      },
    });
    return { completed: true };
  }

  async publicWhatsappClick(slug: string, visitorId: string) {
    const share = await this.publicShareForSlug(slug);
    await this.recordPublicAction(share.id, visitorId, 'whatsapp');
    return { saved: true };
  }

  async publicPdf(slug: string, visitorId: string): Promise<{ filename: string; buffer: Buffer }> {
    const share = await this.publicShareForSlug(slug);
    const reading = share.reading;
    if (!share.allowPdf || !reading.pdfStorageKey || !reading.pdfHash || !reading.pdfFilename)
      throw new NotFoundException('Bu genel okuma için PDF paylaşımı açık değil.');
    const buffer = await this.storage.get(this.config.R2_PRIVATE_BUCKET, reading.pdfStorageKey);
    if (contentHash(buffer) !== reading.pdfHash)
      throw new ConflictException('PDF bütünlük kontrolü başarısız oldu.');
    await this.recordPublicAction(share.id, visitorId, 'pdf');
    return { filename: reading.pdfFilename, buffer };
  }

  async assign(readingId: string, studentIds: string[], adminId: string) {
    const reading = await this.prisma.reading.findUnique({
      where: { id: readingId },
      include: { _count: { select: { sections: true } } },
    });
    if (!reading) throw new NotFoundException('Okuma bulunamadı.');
    if (reading.status !== ReadingStatus.PUBLISHED)
      throw new BadRequestException('Yalnızca yayındaki okumalar paylaşılabilir.');
    const uniqueStudentIds = [...new Set(studentIds)];
    const students = await this.prisma.student.findMany({
      where: { id: { in: uniqueStudentIds } },
      include: { defaultChannelIdentity: true },
    });
    if (students.length !== uniqueStudentIds.length)
      throw new BadRequestException('Öğrenci seçimlerinden biri bulunamadı.');

    const results = [];
    for (const student of students) {
      if (!student.defaultChannelIdentity) {
        results.push({
          studentId: student.id,
          sent: false,
          error: 'Öğrencinin varsayılan mesaj kanalı bulunmuyor.',
        });
        continue;
      }
      const existing = await this.prisma.readingAssignment.findUnique({
        where: { readingId_studentId: { readingId, studentId: student.id } },
      });
      if (existing?.status === ReadingAssignmentStatus.COMPLETED) {
        results.push({
          studentId: student.id,
          assignmentId: existing.id,
          sent: false,
          completed: true,
          error: 'Öğrenci bu okumayı daha önce tamamlamış.',
        });
        continue;
      }
      const token = randomBytes(32).toString('base64url');
      const tokenHmac = this.lookup.digest(token);
      const assignment = existing
        ? await this.prisma.readingAssignment.update({
            where: { id: existing.id },
            data: {
              accessTokenHmac: tokenHmac,
              assignedByAdminId: adminId,
              assignedAt: new Date(),
              version: { increment: 1 },
            },
          })
        : await this.prisma.readingAssignment.create({
            data: {
              readingId,
              studentId: student.id,
              assignedByAdminId: adminId,
              accessTokenHmac: tokenHmac,
            },
          });
      const readingUrl = this.readingUrl(token);
      const eventKey = existing ? 'READING_REMINDER' : 'READING_ASSIGNED';
      try {
        const result = await this.messages.createIntent({
          eventKey,
          studentId: student.id,
          channelIdentityId: student.defaultChannelIdentity.id,
          idempotencyKey: `reading:${assignment.id}:${eventKey.toLowerCase()}:v${assignment.version}`,
          locale: student.preferredLocale,
          stage: student.curriculumStage,
          variables:
            eventKey === 'READING_ASSIGNED'
              ? {
                  studentDisplayName: this.firstNameVariable(student),
                  readingTitle: reading.title,
                  readingUrl,
                  estimatedMinutesText: `${reading.estimatedMinutes} dakika`,
                  sectionCountText: String(reading._count.sections),
                }
              : {
                  studentDisplayName: this.firstNameVariable(student),
                  readingTitle: reading.title,
                  readingUrl,
                },
        });
        await this.prisma.readingAssignment.update({
          where: { id: assignment.id },
          data: { messageIntentId: result.intentId },
        });
        results.push({
          studentId: student.id,
          assignmentId: assignment.id,
          readingUrl,
          sent: true,
          messageIntentId: result.intentId,
        });
      } catch (error) {
        results.push({
          studentId: student.id,
          assignmentId: assignment.id,
          readingUrl,
          sent: false,
          error: error instanceof Error ? error.message : 'Mesaj oluşturulamadı.',
        });
      }
      await this.audit(
        this.prisma,
        'ADMIN',
        adminId,
        existing ? 'READING_REMINDER_REQUESTED' : 'READING_ASSIGNED',
        assignment.id,
        { readingId, studentId: student.id },
      );
    }
    return { items: results };
  }

  async access(token: string) {
    const assignment = await this.assignmentForToken(token);
    if (assignment.reading.status === ReadingStatus.DRAFT)
      throw new NotFoundException('Okuma henüz erişime açık değil.');
    const now = new Date();
    if (assignment.status === ReadingAssignmentStatus.ASSIGNED)
      await this.prisma.readingAssignment.updateMany({
        where: { id: assignment.id, status: ReadingAssignmentStatus.ASSIGNED },
        data: {
          status: ReadingAssignmentStatus.OPENED,
          openedAt: now,
          version: { increment: 1 },
        },
      });
    return this.presentPublicAssignment(assignment);
  }

  async progress(token: string, sectionPosition: number, progressPercent: number) {
    const assignment = await this.assignmentForToken(token);
    if (assignment.status === ReadingAssignmentStatus.COMPLETED)
      return this.presentPublicAssignment(assignment);
    const maximumPosition = assignment.reading.sections.length;
    if (sectionPosition < 1 || sectionPosition > maximumPosition)
      throw new BadRequestException('Geçersiz okuma bölümü.');
    await this.prisma.readingAssignment.update({
      where: { id: assignment.id },
      data: {
        status: ReadingAssignmentStatus.OPENED,
        openedAt: assignment.openedAt ?? new Date(),
        lastSectionPosition: Math.max(assignment.lastSectionPosition, sectionPosition),
        progressPercent: Math.max(assignment.progressPercent, progressPercent),
        version: { increment: 1 },
      },
    });
    return { saved: true };
  }

  async complete(token: string, response?: string) {
    const assignment = await this.assignmentForToken(token);
    const normalized = response?.trim();
    if (normalized && normalized.length > MAX_RESPONSE_LENGTH)
      throw new BadRequestException('Değerlendirme 4.000 karakteri aşamaz.');
    const encrypted = normalized
      ? this.encryption.encrypt(normalized, `reading-assignment:${assignment.id}:response`)
      : undefined;
    const firstCompletion = assignment.status !== ReadingAssignmentStatus.COMPLETED;
    await this.prisma.readingAssignment.update({
      where: { id: assignment.id },
      data: {
        status: ReadingAssignmentStatus.COMPLETED,
        progressPercent: 100,
        lastSectionPosition: assignment.reading.sections.length,
        completedAt: assignment.completedAt ?? new Date(),
        responseEncrypted: encrypted ? new Uint8Array(encrypted.ciphertext) : undefined,
        responseKeyId: encrypted?.keyId,
        version: { increment: 1 },
      },
    });
    await this.audit(
      this.prisma,
      'STUDENT',
      assignment.studentId,
      'READING_COMPLETED',
      assignment.id,
      {
        readingId: assignment.readingId,
        responseProvided: Boolean(normalized),
      },
    );
    if (firstCompletion && assignment.student.defaultChannelIdentity) {
      await this.messages
        .createIntent({
          eventKey: 'READING_COMPLETED_ACK',
          studentId: assignment.studentId,
          channelIdentityId: assignment.student.defaultChannelIdentity.id,
          idempotencyKey: `reading:${assignment.id}:completed`,
          locale: assignment.student.preferredLocale,
          stage: assignment.student.curriculumStage,
          variables: {
            studentDisplayName: this.firstNameVariable(assignment.student),
            readingTitle: assignment.reading.title,
          },
        })
        .catch(() => undefined);
    }
    return { completed: true };
  }

  async pdf(token: string): Promise<{ filename: string; buffer: Buffer }> {
    const assignment = await this.assignmentForToken(token);
    const { reading } = assignment;
    if (!reading.pdfStorageKey || !reading.pdfHash || !reading.pdfFilename)
      throw new NotFoundException('Bu okuma için PDF bulunmuyor.');
    const buffer = await this.storage.get(this.config.R2_PRIVATE_BUCKET, reading.pdfStorageKey);
    if (contentHash(buffer) !== reading.pdfHash)
      throw new ConflictException('PDF bütünlük kontrolü başarısız oldu.');
    return { filename: reading.pdfFilename, buffer };
  }

  private async recordPublicAction(shareId: string, visitorId: string, action: 'pdf' | 'whatsapp') {
    const now = this.clock.now();
    const visitorHmac = this.publicVisitorHmac(shareId, visitorId);
    await this.prisma.readingPublicVisit.upsert({
      where: { shareId_visitorHmac: { shareId, visitorHmac } },
      create: {
        shareId,
        visitorHmac,
        firstOpenedAt: now,
        lastSeenAt: now,
        ...(action === 'pdf'
          ? { pdfDownloadCount: 1, lastPdfDownloadedAt: now }
          : { whatsappClickCount: 1, lastWhatsappClickedAt: now }),
      },
      update:
        action === 'pdf'
          ? {
              pdfDownloadCount: { increment: 1 },
              lastPdfDownloadedAt: now,
              lastSeenAt: now,
            }
          : {
              whatsappClickCount: { increment: 1 },
              lastWhatsappClickedAt: now,
              lastSeenAt: now,
            },
    });
  }

  private async publicShareForSlug(slug: string) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug) || slug.length > 100)
      throw new NotFoundException('Herkese açık okuma bulunamadı.');
    const share = await this.prisma.readingPublicShare.findUnique({
      where: { slug },
      include: {
        reading: {
          include: {
            sections: { orderBy: { position: 'asc' } },
            _count: { select: { sections: true } },
          },
        },
      },
    });
    if (
      !share ||
      share.status !== ReadingPublicShareStatus.ACTIVE ||
      share.reading.status !== ReadingStatus.PUBLISHED ||
      (share.expiresAt !== null && share.expiresAt <= this.clock.now())
    )
      throw new NotFoundException('Herkese açık okuma bulunamadı veya yayından kaldırıldı.');
    return share;
  }

  private validatePublicShareSettings(input: PublicShareSettings) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(input.slug) || input.slug.length > 100)
      throw new BadRequestException('Bağlantı adı yalnızca küçük harf, rakam ve tire içermelidir.');
    if (input.expiresAt !== null && input.expiresAt <= this.clock.now())
      throw new BadRequestException('Son kullanma tarihi gelecekte olmalıdır.');
  }

  private publicVisitorHmac(shareId: string, visitorId: string): string {
    return this.lookup.digest(`public-reading:${shareId}:${visitorId}`);
  }

  private publicReadingUrl(slug: string): string {
    const origin = (
      this.config.PUBLIC_CONTENT_ORIGIN ??
      this.config.ADMIN_ORIGIN ??
      'http://localhost:3001'
    ).replace(/\/+$/u, '');
    return `${origin}/oku/${slug}`;
  }

  private publicReadingImagePath(slug: string, hash?: string | null): string {
    const path = `/v1/readings/public/${encodeURIComponent(slug)}/image`;
    return hash ? `${path}?v=${encodeURIComponent(hash.slice(0, 16))}` : path;
  }

  private async removeStorageObject(key: string | null | undefined, message: string) {
    if (!key) return;
    try {
      await this.storage.remove(this.config.R2_PRIVATE_BUCKET, key);
    } catch (error) {
      this.logger.warn(
        `${message}: ${key}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async assignmentForToken(token: string) {
    if (token.length < 32 || token.length > 100)
      throw new NotFoundException('Okuma bağlantısı geçersiz.');
    const assignment = await this.prisma.readingAssignment.findUnique({
      where: { accessTokenHmac: this.lookup.digest(token) },
      include: {
        reading: { include: { sections: { orderBy: { position: 'asc' } } } },
        student: {
          include: { defaultChannelIdentity: true },
        },
      },
    });
    if (!assignment) throw new NotFoundException('Okuma bağlantısı geçersiz.');
    return assignment;
  }

  private presentPublicAssignment(
    assignment: Awaited<ReturnType<ReadingService['assignmentForToken']>>,
  ) {
    return {
      title: assignment.reading.title,
      description: assignment.reading.description,
      author: assignment.reading.author,
      estimatedMinutes: assignment.reading.estimatedMinutes,
      hasPdf: Boolean(assignment.reading.pdfStorageKey),
      sections: assignment.reading.sections.map((section) => ({
        position: section.position,
        title: section.title,
        contentMarkdown: section.contentMarkdown,
        wordCount: section.wordCount,
      })),
      progress: {
        status: assignment.status,
        lastSectionPosition: assignment.lastSectionPosition,
        progressPercent: assignment.progressPercent,
      },
      response: this.decryptResponse(assignment),
      studentFirstName: this.decryptStudentName(
        assignment.student.id,
        assignment.student.fullNameEncrypted,
        assignment.student.fullNameKeyId,
      )?.split(/\s+/)[0],
    };
  }

  private readingUrl(token: string): string {
    const origin = (this.config.ADMIN_ORIGIN ?? 'http://localhost:3001').replace(/\/+$/u, '');
    return `${origin}/read#${token}`;
  }

  private firstNameVariable(student: {
    id: string;
    fullNameEncrypted: Uint8Array | null;
    fullNameKeyId: string | null;
  }): string {
    const name = this.decryptStudentName(
      student.id,
      student.fullNameEncrypted,
      student.fullNameKeyId,
    );
    return name ? ` ${name.trim().split(/\s+/)[0]}` : '';
  }

  private decryptStudentName(
    studentId: string,
    encrypted: Uint8Array | null,
    keyId: string | null,
  ): string | undefined {
    if (!encrypted || !keyId) return undefined;
    try {
      return this.encryption.decrypt(
        { ciphertext: Buffer.from(encrypted), keyId },
        `student:${studentId}:name`,
      );
    } catch {
      return undefined;
    }
  }

  private decryptResponse(assignment: {
    id: string;
    responseEncrypted: Uint8Array | null;
    responseKeyId: string | null;
  }): string | undefined {
    if (!assignment.responseEncrypted || !assignment.responseKeyId) return undefined;
    try {
      return this.encryption.decrypt(
        {
          ciphertext: Buffer.from(assignment.responseEncrypted),
          keyId: assignment.responseKeyId,
        },
        `reading-assignment:${assignment.id}:response`,
      );
    } catch {
      return undefined;
    }
  }

  private audit(
    tx: Prisma.TransactionClient | PrismaService,
    actorType: 'ADMIN' | 'STUDENT',
    actorId: string,
    action: string,
    entityId: string,
    safeDiff: Record<string, unknown>,
  ) {
    return tx.auditLog.create({
      data: {
        actorType,
        actorId,
        action,
        entityType: 'Reading',
        entityId,
        safeDiff: safeDiff as Prisma.InputJsonValue,
        reason: 'Reading library action',
        requestId: randomUUID(),
        correlationId: randomUUID(),
      },
    });
  }
}

function validateUpload(input: ReadingUpload) {
  const allowedMarkdownTypes = new Set([
    'text/markdown',
    'text/plain',
    'application/octet-stream',
    '',
  ]);
  if (!input.markdown && !input.pdf)
    throw new BadRequestException('Markdown veya PDF dosyası seçin.');
  if (input.markdown) {
    if (!/\.(?:md|markdown)$/iu.test(input.markdown.filename))
      throw new BadRequestException('Ana içerik .md veya .markdown dosyası olmalıdır.');
    if (!allowedMarkdownTypes.has(input.markdown.mimetype))
      throw new BadRequestException('Markdown dosyasının içerik türü desteklenmiyor.');
  }
  if (input.pdf) {
    if (!input.pdf.filename.toLocaleLowerCase('tr-TR').endsWith('.pdf'))
      throw new BadRequestException('Ek kaynak yalnızca PDF olabilir.');
    if (input.pdf.mimetype !== 'application/pdf')
      throw new BadRequestException('PDF dosyasının içerik türü geçersiz.');
    if (input.pdf.buffer.byteLength > MAX_PDF_BYTES)
      throw new BadRequestException('PDF dosyası 25 MiB sınırını aşıyor.');
  }
}

function normalizeTitle(title: string): string {
  const normalized = title.trim();
  if (!normalized) throw new BadRequestException('Okuma başlığı gereklidir.');
  if (normalized.length > 200) throw new BadRequestException('Okuma başlığı çok uzun.');
  return normalized;
}

function normalizeSectionTitle(title: string): string {
  const normalized = title.trim();
  if (!normalized) throw new BadRequestException('Bölüm başlığı gereklidir.');
  if (normalized.length > 240) throw new BadRequestException('Bölüm başlığı çok uzun.');
  return normalized;
}

function normalizeSectionContent(contentMarkdown: string): string {
  const normalized = contentMarkdown.replace(/\r\n?/gu, '\n').trim();
  if (!normalized) throw new BadRequestException('Okuma bölümü boş bırakılamaz.');
  // Parse once on write so pathological Markdown does not first surface in the reader.
  marked.lexer(normalized);
  return normalized;
}

function titleFromFilename(filename: string): string {
  return normalizeTitle(
    filename
      .replace(/\.(?:md|markdown)$/iu, '')
      .replace(/[_-]+/gu, ' ')
      .trim() || 'Adsız okuma',
  );
}

function countAssignmentStatuses(
  assignments: Array<{ status: ReadingAssignmentStatus }>,
): Record<ReadingAssignmentStatus, number> {
  return assignments.reduce(
    (counts, assignment) => {
      counts[assignment.status] += 1;
      return counts;
    },
    {
      ASSIGNED: 0,
      OPENED: 0,
      COMPLETED: 0,
    } satisfies Record<ReadingAssignmentStatus, number>,
  );
}
