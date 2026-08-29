import { describe, expect, it, vi } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import {
  calculateSilenceSeconds,
  MeditationAudioRenderProcessor,
} from './meditation-audio-render.js';

const execFileAsync = promisify(execFile);

describe('meditation audio rendering', () => {
  it('fills the exact remainder between opening and closing guidance', () => {
    expect(calculateSilenceSeconds(15, 75.5, 24.5)).toBe(800);
  });

  it('rejects guidance that is longer than the requested practice', () => {
    expect(() => calculateSilenceSeconds(1, 50, 15)).toThrow('AUDIO_EXCEEDS_TARGET_DURATION');
  });

  it('requeues renders left processing after a worker interruption', async () => {
    const tx = {
      meditationAudioRender: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      outboxEvent: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      meditationAudioRender: {
        findMany: vi.fn().mockResolvedValue([{ id: 'render-1', attempts: 2 }]),
      },
      $transaction: vi.fn((callback: (value: typeof tx) => unknown) => callback(tx)),
    };
    const processor = new MeditationAudioRenderProcessor(prisma as never, {} as never);
    const now = new Date('2026-07-29T12:00:00.000Z');

    await expect(processor.recoverInterrupted(now)).resolves.toBe(1);
    expect(prisma.meditationAudioRender.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          updatedAt: { lt: new Date('2026-07-29T11:30:00.000Z') },
        }),
      }),
    );
    expect(tx.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          topic: 'meditation.audio-render',
          payload: { renderId: 'render-1' },
        }),
      }),
    );
  });
});

describe.runIf(process.env.RUN_FFMPEG_TESTS === 'true')('FFmpeg render integration', () => {
  it('creates a single audio file at the exact requested duration', async () => {
    const root = await mkdtemp(join(tmpdir(), 'meditation-audio-test-'));
    const previousRoot = process.env.KNOWLEDGE_LOCAL_STORAGE_DIR;
    process.env.KNOWLEDGE_LOCAL_STORAGE_DIR = root;
    try {
      const bucket = 'private';
      const sourceDirectory = join(root, bucket, 'sources');
      await mkdir(sourceDirectory, { recursive: true });
      const openingPath = join(sourceDirectory, 'opening.m4a');
      const closingPath = join(sourceDirectory, 'closing.m4a');
      for (const path of [openingPath, closingPath]) {
        await execFileAsync('ffmpeg', [
          '-hide_banner',
          '-loglevel',
          'error',
          '-y',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=440:duration=0.2',
          '-c:a',
          'aac',
          path,
        ]);
      }
      const readyUpdate = vi.fn().mockResolvedValue({});
      const prisma = {
        meditationAudioRender: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findUnique: vi.fn().mockResolvedValue({
            id: 'render-1',
            meditationTypeId: 'type-1',
            sourceVersion: 1,
            durationMinutes: 1,
            openingAudioAssetId: 'opening-1',
            closingAudioAssetId: 'closing-1',
            openingAudio: { filename: 'opening.m4a', storageKey: 'sources/opening.m4a' },
            closingAudio: { filename: 'closing.m4a', storageKey: 'sources/closing.m4a' },
          }),
          update: readyUpdate,
        },
        meditationAudioAsset: { update: vi.fn().mockResolvedValue({}) },
        $transaction: vi.fn((operations: Array<Promise<unknown>>) => Promise.all(operations)),
      };
      const processor = new MeditationAudioRenderProcessor(
        prisma as never,
        { R2_PRIVATE_BUCKET: bucket } as never,
      );

      await processor.process('render-1');

      const readyCall = readyUpdate.mock.calls.find(
        ([value]) => value.data.status === 'READY',
      )?.[0] as
        | {
            data: {
              storageKey: string;
              contentType: string;
              actualDurationSeconds: number;
            };
          }
        | undefined;
      expect(readyCall?.data.actualDurationSeconds).toBeCloseTo(60, 0);
      expect(readyCall?.data.contentType).toBe('audio/flac');
      expect(readyCall?.data.storageKey).toMatch(/\.flac$/);
      const renderedPath = join(root, bucket, readyCall!.data.storageKey);
      expect(await readFile(renderedPath)).not.toHaveLength(0);
      const probe = await execFileAsync('ffprobe', [
        '-v',
        'error',
        '-select_streams',
        'a:0',
        '-show_entries',
        'stream=codec_name,sample_rate,channels,channel_layout',
        '-of',
        'json',
        renderedPath,
      ]);
      const stream = (
        JSON.parse(probe.stdout) as {
          streams: Array<{
            codec_name: string;
            sample_rate: string;
            channels: number;
            channel_layout: string;
          }>;
        }
      ).streams[0];
      expect(stream).toEqual({
        codec_name: 'flac',
        sample_rate: '48000',
        channels: 2,
        channel_layout: 'stereo',
      });
    } finally {
      if (previousRoot === undefined) delete process.env.KNOWLEDGE_LOCAL_STORAGE_DIR;
      else process.env.KNOWLEDGE_LOCAL_STORAGE_DIR = previousRoot;
      await rm(root, { recursive: true, force: true });
    }
  }, 20_000);
});
