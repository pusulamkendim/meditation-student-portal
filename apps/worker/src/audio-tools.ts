import { spawn } from 'node:child_process';

export async function probeAudioDuration(input: Buffer): Promise<number | undefined> {
  try {
    const output = await runWithInput(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        '-i',
        'pipe:0',
      ],
      input,
    );
    const value = Number(output.toString('utf8').trim());
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

export function normalizeAudioToFlac(input: Buffer): Promise<Buffer> {
  return runWithInput(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      'pipe:0',
      '-vn',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-f',
      'flac',
      'pipe:1',
    ],
    input,
  );
}

function runWithInput(command: string, args: string[], input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${command} timed out.`));
    }, 60_000);
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(stdout));
      else reject(new Error(`${command} failed: ${Buffer.concat(stderr).toString('utf8').trim()}`));
    });
    child.stdin.end(input);
  });
}
