'use client';

import { AlertCircle, AudioLines, LoaderCircle, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export type VoiceMediaSummary = {
  id: string;
  status: string;
  durationSeconds?: number | null;
  contentType?: string | null;
  errorCode?: string | null;
};

const statusLabels: Record<string, string> = {
  RECEIVED: 'Ses kaydı alındı',
  STORED: 'Sesli refleksiyon',
  TRANSCRIBING: 'Yazıya dönüştürülüyor',
  TRANSCRIBED: 'Sesli refleksiyon · yazıya dönüştürüldü',
  STORED_WITHOUT_AI: 'Sesli refleksiyon · yalnızca ses kaydı',
  TOO_LONG: 'Sesli refleksiyon · süre sınırı nedeniyle yazıya dönüştürülmedi',
  FAILED: 'Ses kaydı · yazıya dönüştürülemedi',
};

export function VoiceAudioPlayer({ media }: { media: VoiceMediaSummary }) {
  const [audioUrl, setAudioUrl] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(
    () => () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    },
    [audioUrl],
  );

  async function loadAudio() {
    if (audioUrl || loading) return;
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch(`${api}/v1/admin/voice-media/${media.id}/audio`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const url = URL.createObjectURL(await response.blob());
      setAudioUrl(url);
      window.setTimeout(() => void audioRef.current?.play().catch(() => undefined), 0);
    } catch {
      setError('Ses kaydı yüklenemedi. Oturumu yenileyip tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="voice-audio-player" data-status={media.status}>
      <div className="voice-audio-player__meta">
        <AudioLines aria-hidden="true" />
        <span>{statusLabels[media.status] ?? 'Sesli mesaj'}</span>
        {media.durationSeconds ? <time>{formatDuration(media.durationSeconds)}</time> : null}
      </div>
      {audioUrl ? (
        <audio ref={audioRef} controls preload="metadata" src={audioUrl}>
          Tarayıcınız ses kaydını oynatmayı desteklemiyor.
        </audio>
      ) : (
        <button type="button" onClick={() => void loadAudio()} disabled={loading}>
          {loading ? (
            <LoaderCircle className="voice-audio-player__spinner" aria-hidden="true" />
          ) : (
            <Play aria-hidden="true" />
          )}
          {loading ? 'Ses yükleniyor' : 'Dinle'}
        </button>
      )}
      {error ? (
        <small className="voice-audio-player__error">
          <AlertCircle aria-hidden="true" /> {error}
        </small>
      ) : null}
    </section>
  );
}

function formatDuration(seconds: number) {
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  return `${minutes}:${String(rounded % 60).padStart(2, '0')}`;
}
