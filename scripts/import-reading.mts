import { loadApplicationConfig } from '../packages/core/dist/index.js';
import { PrismaClient, ReadingStatus } from '../packages/database/dist/index.js';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

import { createReadingStorage, ReadingService } from '../apps/api/src/readings/reading.service.js';
import type { PrismaService } from '../apps/api/src/database/prisma.service.js';
import type { SystemMessageOrchestrator } from '../apps/api/src/message-catalog/system-message-orchestrator.js';

const options = new Map(
  process.argv
    .slice(2)
    .map((argument) => argument.match(/^--([^=]+)=(.*)$/u))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => [match[1]!, match[2]!]),
);
const markdownPath = options.get('markdown');
const existingReadingId = options.get('reading-id');
const pdfPath = options.get('pdf');
if (!markdownPath && !pdfPath && !existingReadingId)
  throw new Error(
    '--markdown=/path/to/file.md, --pdf=/path/to/file.pdf or --reading-id=<uuid> is required.',
  );
const targetSectionCount = Number(options.get('sections') ?? 5);
if (!Number.isInteger(targetSectionCount) || targetSectionCount < 1 || targetSectionCount > 20)
  throw new Error('--sections must be an integer between 1 and 20.');

const config = loadApplicationConfig();
const prisma = new PrismaClient({ datasourceUrl: config.DATABASE_URL });
const admin = options.get('admin')
  ? await prisma.adminUser.findUnique({ where: { email: options.get('admin')! } })
  : await prisma.adminUser.findFirst({ where: { active: true }, orderBy: { createdAt: 'asc' } });
if (!admin) throw new Error('An active admin user is required.');

const markdownAbsolute = markdownPath ? resolve(markdownPath) : undefined;
const pdfAbsolute = pdfPath ? resolve(pdfPath) : undefined;
const service = new ReadingService(
  prisma as unknown as PrismaService,
  config,
  createReadingStorage(config),
  {
    createIntent: async () => {
      throw new Error('The import command cannot send messages.');
    },
  } as unknown as SystemMessageOrchestrator,
);

try {
  let result;
  let sectionCount: number;
  if (existingReadingId) {
    result = await service.detail(existingReadingId);
    sectionCount = result.sections.length;
  } else {
    const created = await service.upload(
      {
        markdown: markdownAbsolute
          ? {
              filename: basename(markdownAbsolute),
              mimetype: 'text/markdown',
              buffer: await readFile(markdownAbsolute),
            }
          : undefined,
        pdf: pdfAbsolute
          ? {
              filename: basename(pdfAbsolute),
              mimetype: 'application/pdf',
              buffer: await readFile(pdfAbsolute),
            }
          : undefined,
        title: options.get('title'),
        description: options.get('description'),
        author: options.get('author'),
        targetSectionCount,
        estimatedMinutes: options.get('minutes') ? Number(options.get('minutes')) : undefined,
        allowAgent: options.get('allow-agent') === 'true',
      },
      admin.id,
    );
    result =
      options.get('publish') === 'true'
        ? await service.update(
            created.id,
            { expectedVersion: created.version, status: ReadingStatus.PUBLISHED },
            admin.id,
          )
        : created;
    sectionCount = created.sections.length;
  }
  const assignment = options.get('student')
    ? await service.assign(result.id, [options.get('student')!], admin.id)
    : undefined;
  console.info(
    JSON.stringify(
      {
        id: result.id,
        title: result.title,
        status: result.status,
        sections: sectionCount,
        assignment: assignment?.items[0],
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}
