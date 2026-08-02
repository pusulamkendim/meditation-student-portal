import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import type { ApplicationConfig } from '@meditation/core';
import { MeditationRenderStatus, type PrismaClient } from '@meditation/database';

import { WorkerObjectStorage } from './knowledge-storage.js';

const execFileAsync = promisify(execFile);
const OUTPUT_CONTENT_TYPE = 'audio/mp4';

export function calculateSilenceSeconds(
  durationMinutes: number,
  openingSeconds: number,
  closingSeconds = 0,
): number {
  const targetSeconds = durationMinutes * 60;
  const silenceSeconds = targetSeconds - openingSeconds - closingSeconds;
  if (!Number.isFinite(silenceSeconds) || silenceSeconds < 1)
    throw new Error('AUDIO_EXCEEDS_TARGET_DURATION');
  return silenceSeconds;
}

async function probeDuration(path: string): Promise<number> {
  const result = await execFileAsync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      path,
    ],
    { timeout: 30_000 },
  );
  const duration = Number.parseFloat(result.stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('INVALID_AUDIO_DURATION');
  return duration;
}

async function renderAudio(input: {
  openingPath: string;
  closingPath?: string;
  outputPath: string;
  silenceSeconds: number;
}) {
  const args = ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', input.openingPath];
  args.push('-f', 'lavfi', '-t', input.silenceSeconds.toFixed(3), '-i', 'anullsrc=r=44100:cl=mono');
  if (input.closingPath) args.push('-i', input.closingPath);
  const inputs = input.closingPath
    ? ['[opening]', '[silence]', '[closing]']
    : ['[opening]', '[silence]'];
  const filters = [
    '[0:a]aformat=sample_rates=44100:channel_layouts=mono[opening]',
    '[1:a]aformat=sample_rates=44100:channel_layouts=mono[silence]',
    ...(input.closingPath ? ['[2:a]aformat=sample_rates=44100:channel_layouts=mono[closing]'] : []),
    `${inputs.join('')}concat=n=${inputs.length}:v=0:a=1[out]`,
  ];
  args.push(
    '-filter_complex',
    filters.join(';'),
    '-map',
    '[out]',
    '-c:a',
    'aac',
    '-b:a',
    '64k',
    '-threads',
    '1',
    '-movflags',
    '+faststart',
    input.outputPath,
  );
  await execFileAsync('ffmpeg', args, {
    maxBuffer: 4 * 1024 * 1024,
    timeout: 5 * 60_000,
  });
}

export class MeditationAudioRenderProcessor {
  private readonly storage: WorkerObjectStorage;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: ApplicationConfig,
  ) {
    this.storage = new WorkerObjectStorage(config);
  }

  async recoverInterrupted(now: Date, staleAfterMs = 30 * 60_000): Promise<number> {
    const stale = await this.prisma.meditationAudioRender.findMany({
      where: {
        status: MeditationRenderStatus.PROCESSING,
        updatedAt: { lt: new Date(now.getTime() - staleAfterMs) },
      },
      select: { id: true, attempts: true },
    });
    let recovered = 0;
    for (const render of stale) {
      const changed = await this.prisma.$transaction(async (tx) => {
        const reset = await tx.meditationAudioRender.updateMany({
          where: { id: render.id, status: MeditationRenderStatus.PROCESSING },
          data: {
            status: MeditationRenderStatus.PENDING,
            errorCode: 'WORKER_INTERRUPTED',
          },
        });
        if (reset.count !== 1) return false;
        await tx.outboxEvent.create({
          data: {
            topic: 'meditation.audio-render',
            aggregateType: 'MeditationAudioRender',
            aggregateId: render.id,
            eventType: `MEDITATION_AUDIO_RENDER_RECOVERED_${render.attempts + 1}`,
            payload: { renderId: render.id },
          },
        });
        return true;
      });
      if (changed) recovered += 1;
    }
    return recovered;
  }

  async process(renderId: string): Promise<void> {
    const claimed = await this.prisma.meditationAudioRender.updateMany({
      where: { id: renderId, status: MeditationRenderStatus.PENDING },
      data: {
        status: MeditationRenderStatus.PROCESSING,
        attempts: { increment: 1 },
        errorCode: null,
      },
    });
    if (claimed.count !== 1) return;
    const render = await this.prisma.meditationAudioRender.findUnique({
      where: { id: renderId },
      include: { openingAudio: true, closingAudio: true },
    });
    if (!render) return;
    const directory = await mkdtemp(join(tmpdir(), 'meditation-render-'));
    try {
      const openingPath = join(directory, `opening-${basename(render.openingAudio.filename)}`);
      const closingPath = render.closingAudio
        ? join(directory, `closing-${basename(render.closingAudio.filename)}`)
        : undefined;
      const outputPath = join(directory, 'meditation.m4a');
      await writeFile(
        openingPath,
        await this.storage.get(this.config.R2_PRIVATE_BUCKET, render.openingAudio.storageKey),
      );
      if (render.closingAudio && closingPath)
        await writeFile(
          closingPath,
          await this.storage.get(this.config.R2_PRIVATE_BUCKET, render.closingAudio.storageKey),
        );
      const openingSeconds = await probeDuration(openingPath);
      const closingSeconds = closingPath ? await probeDuration(closingPath) : 0;
      const silenceSeconds = calculateSilenceSeconds(
        render.durationMinutes,
        openingSeconds,
        closingSeconds,
      );
      await renderAudio({ openingPath, closingPath, outputPath, silenceSeconds });
      const actualDurationSeconds = await probeDuration(outputPath);
      if (Math.abs(actualDurationSeconds - render.durationMinutes * 60) > 1.5)
        throw new Error('RENDER_DURATION_MISMATCH');
      const body = await readFile(outputPath);
      const contentHash = createHash('sha256').update(body).digest('hex');
      const storageKey = `meditations/renders/${render.meditationTypeId}/v${render.sourceVersion}/${render.durationMinutes}m-${render.id}.m4a`;
      await this.storage.put(this.config.R2_PRIVATE_BUCKET, storageKey, body, OUTPUT_CONTENT_TYPE);
      await this.prisma.$transaction([
        this.prisma.meditationAudioAsset.update({
          where: { id: render.openingAudioAssetId },
          data: { durationSeconds: openingSeconds },
        }),
        ...(render.closingAudioAssetId
          ? [
              this.prisma.meditationAudioAsset.update({
                where: { id: render.closingAudioAssetId },
                data: { durationSeconds: closingSeconds },
              }),
            ]
          : []),
        this.prisma.meditationAudioRender.update({
          where: { id: render.id },
          data: {
            status: MeditationRenderStatus.READY,
            storageKey,
            contentType: OUTPUT_CONTENT_TYPE,
            byteSize: body.byteLength,
            contentHash,
            actualDurationSeconds,
            renderedAt: new Date(),
            errorCode: null,
          },
        }),
      ]);
    } catch (error) {
      const errorCode =
        error instanceof Error &&
        [
          'AUDIO_EXCEEDS_TARGET_DURATION',
          'INVALID_AUDIO_DURATION',
          'RENDER_DURATION_MISMATCH',
        ].includes(error.message)
          ? error.message
          : 'FFMPEG_RENDER_FAILED';
      await this.prisma.meditationAudioRender.updateMany({
        where: { id: render.id, status: MeditationRenderStatus.PROCESSING },
        data: { status: MeditationRenderStatus.FAILED, errorCode },
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
