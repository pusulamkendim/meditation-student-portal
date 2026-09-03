'use client';

import {
  Flower2,
  LoaderCircle,
  MessageCircle,
  Pause,
  Play,
  RotateCcw,
  Timer,
  UsersRound,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { apiUrl } from '../../lib/api/client';
import type { PublicMeditationMeta } from '../../lib/api/types';
import { siteConfig } from '../../lib/config/site';
import { resolveContentImage } from '../../lib/content/images';
import { track } from '../../lib/analytics/client';

type MeditationAccess = {
  title: string;
  description?: string | null;
  durationMinutes: number;
  allowedDurations?: number[];
  allowDurationSelection?: boolean;
  allowIndexing?: boolean;
  coverImageUrl?: string | null;
  coverImageAlt?: string | null;
  visitToken?: string;
  audioUrl?: string;
  guided: boolean;
};

type MeditationPlayerProps = {
  slug: string;
  meta: PublicMeditationMeta;
};

type WakeLockSentinel = {
  released: boolean;
  release(): Promise<void>;
};

function publicVisitorId() {
  const key = 'meditation_public_visitor_id';
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID().replaceAll('-', '');
  localStorage.setItem(key, created);
  return created;
}

async function accessPublicMeditation(slug: string, durationMinutes?: number) {
  const query = new URLSearchParams(window.location.search);
  const response = await fetch(
    apiUrl(`/v1/public/meditations/${encodeURIComponent(slug)}/access`),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        visitorId: publicVisitorId(),
        ...(durationMinutes ? { durationMinutes } : {}),
        source: query.get('utm_source') ?? undefined,
        medium: query.get('utm_medium') ?? undefined,
        campaign: query.get('utm_campaign') ?? undefined,
      }),
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      (payload as { message?: string }).message ?? 'Meditasyon bağlantısı kullanılamıyor.',
    );
  }
  return payload as MeditationAccess;
}

function recordPublicEvent(token: string, event: 'START' | 'COMPLETE' | 'CTA_VIEW' | 'CTA_CLICK') {
  return fetch(apiUrl('/v1/public/meditations/events'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, event }),
    keepalive: true,
  }).catch(() => undefined);
}

function initialPractice(meta: PublicMeditationMeta): MeditationAccess {
  return {
    title: meta.title,
    description: meta.description,
    durationMinutes: meta.defaultDurationMinutes ?? meta.durations[0] ?? 10,
    allowedDurations: meta.durations,
    allowDurationSelection: meta.allowDurationSelection,
    allowIndexing: meta.allowIndexing,
    guided: meta.guided,
  };
}

export function MeditationPlayer({ slug, meta }: MeditationPlayerProps) {
  const [practice, setPractice] = useState<MeditationAccess>(() => initialPractice(meta));
  const [accessReady, setAccessReady] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(
    () => (meta.defaultDurationMinutes ?? meta.durations[0] ?? 10) * 60,
  );
  const [playing, setPlaying] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);
  const [error, setError] = useState<string>();
  const audioRef = useRef<HTMLAudioElement>(null);
  const bellRef = useRef<HTMLAudioElement>(null);
  const bellUnlockedRef = useRef(false);
  const startedAtRef = useRef(0);
  const elapsedAtStartRef = useRef(0);
  const wakeLockRef = useRef<WakeLockSentinel | undefined>(undefined);
  const playingRef = useRef(false);
  const completedRef = useRef(false);
  const ctaClickedRef = useRef(false);

  const totalSeconds = practice.durationMinutes * 60;
  const audioUrl = useMemo(() => {
    if (!practice.audioUrl) return undefined;
    return /^https?:\/\//u.test(practice.audioUrl) ? practice.audioUrl : apiUrl(practice.audioUrl);
  }, [practice.audioUrl]);

  useEffect(() => {
    track('meditation_view', { slug });
    const requestedDuration = Number(new URLSearchParams(window.location.search).get('sure'));
    const duration =
      Number.isInteger(requestedDuration) && requestedDuration > 0 ? requestedDuration : undefined;
    let active = true;
    setAccessReady(false);
    setError(undefined);
    void accessPublicMeditation(slug, duration)
      .then((result) => {
        if (!active) return;
        setPractice(result);
        setRemainingSeconds(result.durationMinutes * 60);
        setAudioFailed(false);
        setCompleted(false);
        completedRef.current = false;
        ctaClickedRef.current = false;
        setAccessReady(true);
      })
      .catch((reason) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : 'Meditasyon bağlantısı açılamadı.');
      });
    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    if (!accessReady) return;
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement('meta');
      robots.name = 'robots';
      document.head.append(robots);
    }
    robots.content = meta.allowIndexing ? 'index, follow' : 'noindex, nofollow';
  }, [accessReady, meta.allowIndexing]);

  const releaseWakeLock = useCallback(async () => {
    const wakeLock = wakeLockRef.current;
    wakeLockRef.current = undefined;
    if (wakeLock && !wakeLock.released) await wakeLock.release().catch(() => undefined);
  }, []);

  const requestWakeLock = useCallback(async () => {
    const wakeLockApi = (
      navigator as Navigator & {
        wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinel> };
      }
    ).wakeLock;
    if (!wakeLockApi || document.visibilityState !== 'visible') return;
    await releaseWakeLock();
    wakeLockRef.current = await wakeLockApi.request('screen').catch(() => undefined);
  }, [releaseWakeLock]);

  const unlockEndBell = useCallback(() => {
    const bell = bellRef.current;
    if (!bell || bellUnlockedRef.current) return;
    bell.muted = true;
    void bell
      .play()
      .then(() => {
        bell.pause();
        bell.currentTime = 0;
        bell.muted = false;
        bellUnlockedRef.current = true;
      })
      .catch(() => {
        bell.muted = false;
      });
  }, []);

  const playEndBell = useCallback(() => {
    const bell = bellRef.current;
    if (!bell) return;
    bell.pause();
    bell.currentTime = 0;
    bell.muted = false;
    void bell.play().catch(() => undefined);
  }, []);

  const finish = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    setRemainingSeconds(0);
    setPlaying(false);
    playingRef.current = false;
    setCompleted(true);
    playEndBell();
    if (practice.visitToken) {
      void recordPublicEvent(practice.visitToken, 'COMPLETE');
      void recordPublicEvent(practice.visitToken, 'CTA_VIEW');
    }
    track('meditation_complete', { slug });
    void releaseWakeLock();
  }, [playEndBell, practice.visitToken, releaseWakeLock, slug]);

  useEffect(() => {
    playingRef.current = playing;
    if (!playing || !accessReady) return;
    const timer = window.setInterval(() => {
      const audio = audioRef.current;
      const elapsed =
        audioUrl && !audioFailed && audio
          ? audio.currentTime
          : elapsedAtStartRef.current + (Date.now() - startedAtRef.current) / 1_000;
      const next = Math.max(0, Math.ceil(totalSeconds - elapsed));
      setRemainingSeconds(next);
      if (next === 0) finish();
    }, 250);
    return () => window.clearInterval(timer);
  }, [accessReady, audioFailed, audioUrl, finish, playing, totalSeconds]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && playingRef.current) void requestWakeLock();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      void releaseWakeLock();
    };
  }, [releaseWakeLock, requestWakeLock]);

  async function start() {
    if (!accessReady) return;
    let nextRemaining = remainingSeconds;
    if (completed || remainingSeconds <= 0) {
      nextRemaining = totalSeconds;
      setRemainingSeconds(totalSeconds);
      setCompleted(false);
      completedRef.current = false;
      ctaClickedRef.current = false;
      if (audioRef.current) audioRef.current.currentTime = 0;
    }
    const elapsed = totalSeconds - nextRemaining;
    elapsedAtStartRef.current = elapsed;
    startedAtRef.current = Date.now();
    setPlaying(true);
    unlockEndBell();
    track('meditation_start', { slug });
    if (practice.visitToken) void recordPublicEvent(practice.visitToken, 'START');
    if (audioUrl && !audioFailed && audioRef.current) {
      audioRef.current.currentTime = elapsed;
      await audioRef.current.play().catch(() => setAudioFailed(true));
    }
    await requestWakeLock();
  }

  function pause() {
    const audio = audioRef.current;
    if (audio && !audioFailed) audio.pause();
    elapsedAtStartRef.current = totalSeconds - remainingSeconds;
    setPlaying(false);
    playingRef.current = false;
    void releaseWakeLock();
  }

  function restart() {
    pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
    if (bellRef.current) {
      bellRef.current.pause();
      bellRef.current.currentTime = 0;
    }
    elapsedAtStartRef.current = 0;
    setRemainingSeconds(totalSeconds);
    setCompleted(false);
    completedRef.current = false;
    ctaClickedRef.current = false;
  }

  async function selectDuration(durationMinutes: number) {
    if (!accessReady || durationMinutes === practice.durationMinutes) return;
    pause();
    setError(undefined);
    setAccessReady(false);
    try {
      const result = await accessPublicMeditation(slug, durationMinutes);
      setPractice(result);
      setRemainingSeconds(result.durationMinutes * 60);
      setAudioFailed(false);
      setCompleted(false);
      completedRef.current = false;
      ctaClickedRef.current = false;
      setAccessReady(true);
      const url = new URL(window.location.href);
      url.searchParams.set('sure', String(durationMinutes));
      window.history.replaceState({}, '', url);
    } catch (reason) {
      setAccessReady(true);
      setError(reason instanceof Error ? reason.message : 'Meditasyon süresi değiştirilemedi.');
    }
  }

  if (error) {
    return (
      <section className="practice-player-state" role="alert">
        <Timer aria-hidden="true" />
        <h1>Meditasyon açılamadı</h1>
        <p>{error}</p>
      </section>
    );
  }

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const progress = totalSeconds ? ((totalSeconds - remainingSeconds) / totalSeconds) * 100 : 0;
  const whatsappUrl = siteConfig.links.introCallWhatsapp;
  const scene = resolveContentImage(meta);

  return (
    <section
      className={`practice-player${playing ? ' is-playing' : ''}${completed ? ' is-completed' : ''}`}
      aria-labelledby="meditation-player-title"
    >
      <div className="practice-player-scene" aria-hidden="true">
        <div
          className="practice-player-background"
          style={{ backgroundImage: `url("${scene.src}")` }}
        />
        <div className="practice-player-shade" />
        <div className="practice-player-grain" />
        <div className="practice-player-frame" />
      </div>

      <div className="practice-player-stage">
        <div className="practice-player-heading">
          <span>BİR AN BURADA KAL</span>
          <h1 id="meditation-player-title">{practice.title}</h1>
          {practice.description ? <p>{practice.description}</p> : null}
        </div>

        {practice.allowDurationSelection && practice.allowedDurations?.length ? (
          <div className="practice-player-durations" aria-label="Meditasyon süresi">
            {practice.allowedDurations.map((duration) => (
              <button
                type="button"
                key={duration}
                className={duration === practice.durationMinutes ? 'is-active' : undefined}
                disabled={playing || !accessReady}
                onClick={() => void selectDuration(duration)}
              >
                {duration} dk
              </button>
            ))}
          </div>
        ) : null}

        <div className="practice-player-timer-shell">
          <svg
            className="practice-player-ring"
            viewBox="0 0 360 360"
            role="progressbar"
            aria-label="Meditasyon ilerlemesi"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
          >
            <circle className="practice-player-ring-base" cx="180" cy="180" r="158" />
            <circle className="practice-player-ring-dots" cx="180" cy="180" r="145" />
            <circle
              className="practice-player-ring-progress"
              cx="180"
              cy="180"
              r="158"
              pathLength="100"
              style={{ strokeDashoffset: 100 - progress }}
            />
          </svg>

          <div className="practice-player-clock" aria-live="polite">
            <span>KALAN SÜRE</span>
            <strong>
              {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
            </strong>
            <small>{playing ? 'anda kal' : `${practice.durationMinutes} dakika`}</small>
          </div>
        </div>

        {completed ? (
          <aside className="practice-player-cta">
            <div className="practice-player-cta-copy">
              <span className="practice-player-cta-icon">
                <UsersRound aria-hidden="true" />
              </span>
              <div>
                <span>BİREBİR MEDITASYON</span>
                <strong>Bu pratiği sana uygun bir düzene dönüştürmek ister misin?</strong>
                <p>Tanışma görüşmesinde ihtiyaçlarını ve sana uygun süreci konuşabiliriz.</p>
              </div>
            </div>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                if (practice.visitToken && !ctaClickedRef.current) {
                  ctaClickedRef.current = true;
                  void recordPublicEvent(practice.visitToken, 'CTA_CLICK');
                }
                track('whatsapp_click', { slug, location: 'meditation-complete' });
              }}
            >
              <MessageCircle aria-hidden="true" /> Ücretsiz Tanışma Görüşmesi Yap
            </a>
          </aside>
        ) : null}

        {audioUrl ? (
          <audio
            ref={audioRef}
            data-testid="practice-audio"
            src={audioUrl}
            preload="metadata"
            playsInline
            onEnded={finish}
            onError={() => setAudioFailed(true)}
          />
        ) : null}

        <audio
          ref={bellRef}
          data-testid="end-bell"
          src="/meditation/end-bell.m4a"
          preload="auto"
          playsInline
        />

        <div className="practice-player-controls">
          <button
            type="button"
            className="practice-player-secondary"
            title="Başa dön"
            aria-label="Başa dön"
            onClick={restart}
            disabled={!accessReady}
          >
            <RotateCcw aria-hidden="true" />
          </button>
          {playing ? (
            <button type="button" className="practice-player-primary" onClick={pause}>
              <Pause aria-hidden="true" /> Duraklat
            </button>
          ) : (
            <button
              type="button"
              className="practice-player-primary"
              onClick={() => void start()}
              disabled={!accessReady}
            >
              {accessReady ? (
                <Play aria-hidden="true" />
              ) : (
                <LoaderCircle className="spin" aria-hidden="true" />
              )}
              {completed ? 'Tekrar başlat' : accessReady ? 'Başlat' : 'Bağlantı kuruluyor'}
            </button>
          )}
        </div>

        {completed ? (
          <div className="practice-player-completion-note">
            <Flower2 aria-hidden="true" />
            <span>Farkındalıkla devam et</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
