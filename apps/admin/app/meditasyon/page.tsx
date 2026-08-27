'use client';

import {
  CheckCircle2,
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

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

type PracticeAccess = {
  title: string;
  description?: string | null;
  startsAt?: string;
  durationMinutes: number;
  allowedDurations?: number[];
  allowDurationSelection?: boolean;
  allowIndexing?: boolean;
  visitToken?: string;
  audioUrl?: string;
  guided: boolean;
};

type PracticePlayerPageProps = { publicSlug?: string };

type WakeLockSentinel = {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
};

async function accessPractice(accessKey: string): Promise<PracticeAccess> {
  const response = await fetch(`${api}/v1/public/practices/access`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(accessKey.includes('.') ? { token: accessKey } : { code: accessKey }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      (payload as { message?: string }).message ?? 'Pratik bağlantısı geçersiz veya süresi dolmuş.',
    );
  return payload as PracticeAccess;
}

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
  const response = await fetch(`${api}/v1/public/meditations/${encodeURIComponent(slug)}/access`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      visitorId: publicVisitorId(),
      ...(durationMinutes ? { durationMinutes } : {}),
      source: query.get('utm_source') ?? undefined,
      medium: query.get('utm_medium') ?? undefined,
      campaign: query.get('utm_campaign') ?? undefined,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      (payload as { message?: string }).message ?? 'Meditasyon bağlantısı kullanılamıyor.',
    );
  return payload as PracticeAccess;
}

function recordPublicEvent(token: string, event: 'START' | 'COMPLETE' | 'CTA_VIEW' | 'CTA_CLICK') {
  return fetch(`${api}/v1/public/meditations/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, event }),
    keepalive: true,
  }).catch(() => undefined);
}

export default function PracticePlayerPage({ publicSlug }: PracticePlayerPageProps = {}) {
  const [practice, setPractice] = useState<PracticeAccess>();
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);
  const [error, setError] = useState<string>();
  const audioRef = useRef<HTMLAudioElement>(null);
  const bellRef = useRef<HTMLAudioElement>(null);
  const startedAtRef = useRef(0);
  const elapsedAtStartRef = useRef(0);
  const wakeLockRef = useRef<WakeLockSentinel | undefined>(undefined);
  const playingRef = useRef(false);
  const completedRef = useRef(false);
  const bellUnlockedRef = useRef(false);
  const ctaClickedRef = useRef(false);
  const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER ?? '905428078429';

  const totalSeconds = (practice?.durationMinutes ?? 0) * 60;
  const audioUrl = useMemo(() => {
    if (!practice?.audioUrl) return undefined;
    return /^https?:\/\//u.test(practice.audioUrl)
      ? practice.audioUrl
      : `${api}${practice.audioUrl}`;
  }, [practice]);

  useEffect(() => {
    const requestedDuration = Number(new URLSearchParams(window.location.search).get('sure'));
    const access = publicSlug
      ? accessPublicMeditation(
          publicSlug,
          Number.isInteger(requestedDuration) && requestedDuration > 0
            ? requestedDuration
            : undefined,
        )
      : (() => {
          const token = window.location.hash.slice(1);
          if (!token) return Promise.reject(new Error('Pratik bağlantısı eksik veya geçersiz.'));
          return accessPractice(token);
        })();
    void access
      .then((result) => {
        setPractice(result);
        setRemainingSeconds(result.durationMinutes * 60);
      })
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : 'Pratik bağlantısı açılamadı.'),
      );
  }, [publicSlug]);

  useEffect(() => {
    if (!publicSlug || !practice) return;
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement('meta');
      robots.name = 'robots';
      document.head.append(robots);
    }
    robots.content = practice.allowIndexing ? 'index, follow' : 'noindex, nofollow';
  }, [practice, publicSlug]);

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
    if (practice?.visitToken) {
      void recordPublicEvent(practice.visitToken, 'COMPLETE');
      void recordPublicEvent(practice.visitToken, 'CTA_VIEW');
    }
    void releaseWakeLock();
  }, [playEndBell, practice?.visitToken, releaseWakeLock]);

  useEffect(() => {
    playingRef.current = playing;
    if (!playing || !practice) return;
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
  }, [audioFailed, audioUrl, finish, playing, practice, totalSeconds]);

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
    if (!practice) return;
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

  async function selectPublicDuration(durationMinutes: number) {
    if (!publicSlug || durationMinutes === practice?.durationMinutes) return;
    pause();
    setError(undefined);
    setPractice(undefined);
    try {
      const result = await accessPublicMeditation(publicSlug, durationMinutes);
      setPractice(result);
      setRemainingSeconds(result.durationMinutes * 60);
      const url = new URL(window.location.href);
      url.searchParams.set('sure', String(durationMinutes));
      window.history.replaceState({}, '', url);
      setAudioFailed(false);
      setCompleted(false);
      completedRef.current = false;
      ctaClickedRef.current = false;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Meditasyon süresi değiştirilemedi.');
    }
  }

  if (error)
    return (
      <main className="practice-player-state" role="alert">
        <Timer aria-hidden="true" />
        <h1>Pratik açılamadı</h1>
        <p>{error}</p>
      </main>
    );
  if (!practice)
    return (
      <main className="practice-player-state">
        <LoaderCircle className="spin" aria-hidden="true" />
        <p>Pratiğin hazırlanıyor...</p>
      </main>
    );

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const progress = totalSeconds ? ((totalSeconds - remainingSeconds) / totalSeconds) * 100 : 0;
  const whatsappMessage = `Merhaba Necip, “${practice.title}” meditasyonunu tamamladım. Birebir meditasyon hakkında bilgi almak istiyorum.`;
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}`;

  return (
    <main
      className={`practice-player${playing ? ' is-playing' : ''}${completed ? ' is-completed' : ''}`}
    >
      <div className="practice-player-scene" aria-hidden="true">
        <div className="practice-player-background" />
        <div className="practice-player-shade" />
        <div className="practice-player-amber-flow" />
        <div className="practice-player-grain" />
        <div className="practice-player-frame" />
      </div>

      <header className="practice-player-brand">
        <a href="https://sakinzihin.com" aria-label="Sakin Zihin kütüphanesi">
          <Flower2 aria-hidden="true" />
          SAKİN ZİHİN
        </a>
        <span>MEDİTASYON / {practice.durationMinutes} DK</span>
      </header>

      <section className="practice-player-stage">
        <div className="practice-player-heading">
          <span>BİR AN BURADA KAL</span>
          <h1>{practice.title}</h1>
          {practice.description ? <p>{practice.description}</p> : null}
        </div>

        {publicSlug && practice.allowDurationSelection && practice.allowedDurations?.length ? (
          <div className="practice-player-durations" aria-label="Meditasyon süresi">
            {practice.allowedDurations.map((duration) => (
              <button
                type="button"
                key={duration}
                className={duration === practice.durationMinutes ? 'is-active' : undefined}
                disabled={playing}
                onClick={() => void selectPublicDuration(duration)}
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
          <>
            <div className="practice-player-complete">
              <span className="practice-player-complete-icon">
                <CheckCircle2 aria-hidden="true" />
              </span>
              <div>
                <strong>Pratik süren tamamlandı</strong>
                <p>
                  {publicSlug
                    ? 'Kendine ayırdığın bu alan tamamlandı.'
                    : 'Mesajındaki Yaptım seçeneğiyle pratiğini kaydedebilirsin.'}
                </p>
              </div>
            </div>
            {publicSlug ? (
              <aside className="practice-player-cta">
                <div className="practice-player-cta-copy">
                  <span className="practice-player-cta-icon">
                    <UsersRound aria-hidden="true" />
                  </span>
                  <div>
                    <span>BİREBİR MEDİTASYON</span>
                    <strong>Bu pratiği sana uygun bir düzene dönüştürmek ister misin?</strong>
                    <p>
                      Haftalık birebir görüşmeler, kişisel pratik planı ve düzenli takip ile süreci
                      birlikte sürdürebiliriz.
                    </p>
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
                  }}
                >
                  <MessageCircle aria-hidden="true" />
                  Programı konuşalım
                </a>
              </aside>
            ) : null}
          </>
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
          >
            <RotateCcw aria-hidden="true" />
          </button>
          {playing ? (
            <button type="button" className="practice-player-primary" onClick={pause}>
              <Pause aria-hidden="true" /> Duraklat
            </button>
          ) : (
            <button type="button" className="practice-player-primary" onClick={() => void start()}>
              <Play aria-hidden="true" /> {completed ? 'Tekrar başlat' : 'Başlat'}
            </button>
          )}
        </div>

        {completed ? (
          <div className="practice-player-completion-note">
            <Flower2 aria-hidden="true" />
            <span>Farkındalıkla devam et</span>
          </div>
        ) : null}
      </section>
    </main>
  );
}
