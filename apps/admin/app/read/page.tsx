'use client';

import { BookOpen, Check, ChevronLeft, ChevronRight, Download, LoaderCircle } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

type ReadingAccess = {
  title: string;
  description?: string | null;
  author?: string | null;
  estimatedMinutes: number;
  hasPdf: boolean;
  studentFirstName?: string;
  sections: Array<{
    position: number;
    title: string;
    contentMarkdown: string;
    wordCount: number;
  }>;
  progress: {
    status: 'ASSIGNED' | 'OPENED' | 'COMPLETED';
    lastSectionPosition: number;
    progressPercent: number;
  };
  response?: string;
};

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${api}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error((payload as { message?: string }).message ?? 'Okuma açılamadı.');
  return payload as T;
}

export default function PublicReadingPage() {
  const [token, setToken] = useState('');
  const [reading, setReading] = useState<ReadingAccess>();
  const [sectionIndex, setSectionIndex] = useState(0);
  const [response, setResponse] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [completed, setCompleted] = useState(false);
  const contentStartRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const value = window.location.hash.slice(1);
    if (!value) {
      setError('Okuma bağlantısı eksik veya geçersiz.');
      return;
    }
    setToken(value);
    void post<ReadingAccess>('/v1/readings/access', { token: value })
      .then((result) => {
        setReading(result);
        setSectionIndex(
          Math.max(
            0,
            Math.min(result.sections.length - 1, result.progress.lastSectionPosition - 1),
          ),
        );
        setResponse(result.response ?? '');
        setCompleted(result.progress.status === 'COMPLETED');
      })
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : 'Okuma bağlantısı açılamadı.'),
      );
  }, []);

  const progress = useMemo(() => {
    if (!reading) return 0;
    return completed ? 100 : Math.round(((sectionIndex + 1) / reading.sections.length) * 100);
  }, [completed, reading, sectionIndex]);

  async function goTo(index: number) {
    if (!reading) return;
    const next = Math.max(0, Math.min(reading.sections.length - 1, index));
    setSectionIndex(next);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        contentStartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    await post('/v1/readings/progress', {
      token,
      sectionPosition: next + 1,
      progressPercent: Math.round(((next + 1) / reading.sections.length) * 100),
    }).catch(() => undefined);
  }

  async function finish() {
    setBusy(true);
    setError(undefined);
    try {
      await post('/v1/readings/complete', { token, response: response.trim() || undefined });
      setCompleted(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Değerlendirme kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  }

  async function openPdf() {
    setBusy(true);
    try {
      const result = await fetch(`${api}/v1/readings/pdf`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!result.ok) throw new Error('PDF açılamadı.');
      const url = URL.createObjectURL(await result.blob());
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'PDF açılamadı.');
    } finally {
      setBusy(false);
    }
  }

  if (error && !reading)
    return (
      <main className="public-reading-state">
        <BookOpen aria-hidden="true" />
        <h1>Okuma açılamadı</h1>
        <p>{error}</p>
      </main>
    );
  if (!reading)
    return (
      <main className="public-reading-state">
        <LoaderCircle className="spin" aria-hidden="true" />
        <p>Okuma hazırlanıyor...</p>
      </main>
    );

  const section = reading.sections[sectionIndex]!;
  return (
    <main className="public-reader">
      <header className="public-reader-header">
        <div className="public-reader-brand">
          <span>
            <BookOpen aria-hidden="true" />
          </span>
          <div>
            <strong>Meditasyon</strong>
            <small>Okuma alanı</small>
          </div>
        </div>
        {reading.hasPdf ? (
          <button type="button" onClick={() => void openPdf()} disabled={busy}>
            <Download aria-hidden="true" /> PDF
          </button>
        ) : null}
      </header>

      <div className="public-reader-progress" aria-label={`İlerleme yüzde ${progress}`}>
        <span style={{ width: `${progress}%` }} />
      </div>

      <div className="public-reader-shell">
        <aside>
          <p>
            {reading.studentFirstName
              ? `Merhaba ${reading.studentFirstName}`
              : 'Okumana hoş geldin'}
          </p>
          <h1>{reading.title}</h1>
          {reading.description ? <div>{reading.description}</div> : null}
          <dl>
            <div>
              <dt>Süre</dt>
              <dd>{reading.estimatedMinutes} dakika</dd>
            </div>
            <div>
              <dt>Bölüm</dt>
              <dd>{reading.sections.length}</dd>
            </div>
          </dl>
          <label className="public-reader-mobile-sections">
            <span>
              <strong>Bölümler</strong>
              <small>
                {sectionIndex + 1} / {reading.sections.length}
              </small>
            </span>
            <select
              aria-label="Bölüm seç"
              value={sectionIndex}
              onChange={(event) => void goTo(Number(event.target.value))}
            >
              {reading.sections.map((item, index) => (
                <option key={item.position} value={index}>
                  {String(item.position).padStart(2, '0')} · {item.title}
                </option>
              ))}
            </select>
          </label>
          <nav aria-label="Bölümler">
            {reading.sections.map((item, index) => (
              <button
                type="button"
                key={item.position}
                className={sectionIndex === index ? 'is-active' : undefined}
                onClick={() => void goTo(index)}
              >
                <span>{String(item.position).padStart(2, '0')}</span>
                <strong>{item.title}</strong>
                {index < sectionIndex || completed ? <Check aria-hidden="true" /> : null}
              </button>
            ))}
          </nav>
        </aside>

        <section ref={contentStartRef} className="public-reader-content">
          <article>
            <div className="public-reading-kicker">
              Bölüm {section.position} / {reading.sections.length}
            </div>
            <h2>{section.title}</h2>
            <ReactMarkdown skipHtml disallowedElements={['img']}>
              {section.contentMarkdown}
            </ReactMarkdown>
          </article>

          {sectionIndex === reading.sections.length - 1 ? (
            <section className="public-reading-reflection">
              {completed ? (
                <div className="public-reading-complete">
                  <span>
                    <Check aria-hidden="true" />
                  </span>
                  <div>
                    <h3>Okumayı tamamladın</h3>
                    <p>Paylaşımın kaydedildi. Görüşmenizde birlikte değerlendirebilirsiniz.</p>
                  </div>
                </div>
              ) : (
                <>
                  <span>Okuma değerlendirmesi</span>
                  <h3>Bu okumadan sende en çok kalan düşünce veya bölüm ne oldu?</h3>
                  <textarea
                    value={response}
                    onChange={(event) => setResponse(event.target.value)}
                    maxLength={4000}
                    rows={5}
                    placeholder="Birkaç cümleyle paylaşabilirsin..."
                  />
                  {error ? <p className="public-reading-error">{error}</p> : null}
                  <button type="button" onClick={() => void finish()} disabled={busy}>
                    <Check aria-hidden="true" />
                    {busy ? 'Kaydediliyor...' : 'Okumayı tamamla'}
                  </button>
                </>
              )}
            </section>
          ) : null}

          <footer className="public-reader-navigation">
            <button
              type="button"
              onClick={() => void goTo(sectionIndex - 1)}
              disabled={sectionIndex === 0}
              aria-label="Önceki bölüm"
            >
              <ChevronLeft aria-hidden="true" /> Önceki
            </button>
            <span>{section.wordCount} kelime</span>
            <button
              type="button"
              onClick={() => void goTo(sectionIndex + 1)}
              disabled={sectionIndex === reading.sections.length - 1}
            >
              Sonraki <ChevronRight aria-hidden="true" />
            </button>
          </footer>
        </section>
      </div>
    </main>
  );
}
