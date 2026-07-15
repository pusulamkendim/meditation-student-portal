import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadApplicationConfig } from '@meditation/core';
import { LlmTask, PrismaClient } from '@meditation/database';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../packages/prompts');

async function main() {
  loadApplicationConfig();
  const prisma = new PrismaClient();
  try {
    const taskDirectories = await readdir(root, { withFileTypes: true });
    let synced = 0;
    for (const directory of taskDirectories.filter((entry) => entry.isDirectory())) {
      const task = directory.name as LlmTask;
      if (!Object.values(LlmTask).includes(task)) continue;
      const files = await readdir(resolve(root, directory.name));
      for (const file of files.filter((name) => name.endsWith('.md'))) {
        const semanticVersion = file.slice(0, -3);
        const sourcePath = `packages/prompts/${directory.name}/${file}`;
        const content = await readFile(resolve(root, directory.name, file), 'utf8');
        const sha256 = createHash('sha256').update(content).digest('hex');
        const existing = await prisma.llmPromptVersion.findUnique({
          where: { task_semanticVersion: { task, semanticVersion } },
        });
        if (existing && existing.sha256 !== sha256)
          throw new Error(
            `Prompt ${task}/${semanticVersion} changed; publish a new semantic version.`,
          );
        const prompt =
          existing ??
          (await prisma.llmPromptVersion.create({
            data: {
              task,
              semanticVersion,
              sourcePath,
              sha256,
              content,
              outputSchemaVersion:
                task === LlmTask.INBOUND_INTENT
                  ? 'inbound-intent-v1'
                  : task === LlmTask.REFLECTION_TAGGING
                    ? 'reflection-tags-v1'
                    : task === LlmTask.WEEKLY_SUMMARY
                      ? 'weekly-summary-v1'
                      : task === LlmTask.AGENT_REPLY
                        ? 'agent-reply-v2'
                        : 'embedding-v1',
              approvedAt: new Date(),
            },
          }));
        const config = await prisma.llmTaskConfig.findUnique({ where: { task } });
        if (config && !config.promptVersionId)
          await prisma.llmTaskConfig.update({
            where: { id: config.id },
            data: { promptVersionId: prompt.id },
          });
        synced += 1;
      }
    }
    process.stdout.write(`Synced ${synced} prompt version(s).\n`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Prompt sync failed'}\n`);
  process.exit(1);
});
