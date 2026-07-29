'use client';

import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  LoaderCircle,
  MessageCircle,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
const VISITOR_STORAGE_KEY = 'meditation_public_reader_id';
const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER ?? '905428078429';

type PublicReading = {
  title: string;
  description?: string | null;
  author?: string | null;
  estimatedMinutes: number;
  hasPdf: boolean;
  sections: Array<{
    position: number;
    title: string;
    contentMarkdown: string;
    wordCount: number;
  }>;
  progress: {
    lastSectionPosition: number;
    progressPercent: number;
    completed: boolean;
  };
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

function visitorId() {
  const existing = window.localStorage.getItem(VISITOR_STORAGE_KEY);
  if (
    existing &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(existing)
  )
    return existing;
  const created = window.crypto.randomUUID();
  window.localStorage.setItem(VISITOR_STORAGE_KEY, created);
  return created;
}

export function PublicReadingClient({ slug }: { slug: string }) {
  const [visitor, setVisitor] = useState('');
  const [reading, setReading] = useState<PublicReading>();
  const [sectionIndex, setSectionIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [completed, setCompleted] = useState(false);
  const contentStartRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const id = visitorId();
    const search = new URLSearchParams(window.location.search);
    setVisitor(id);
    void post<PublicReading>(`/v1/readings/public/${encodeURIComponent(slug)}/access`, {
      visitorId: id,
      source: search.get('utm_source') || undefined,
      medium: search.get('utm_medium') || undefined,
      campaign: search.get('utm_campaign') || undefined,
    })
      .then((result) => {
        const initialIndex = Math.max(
          0,
          Math.min(result.sections.length - 1, result.progress.lastSectionPosition - 1),
        );
        setReading(result);
        setSectionIndex(initialIndex);
        setCompleted(result.progress.completed);
        return post(`/v1/readings/public/${encodeURIComponent(slug)}/progress`, {
          visitorId: id,
          sectionPosition: initialIndex + 1,
          progressPercent: Math.max(
            result.progress.progressPercent,
            Math.round(((initialIndex + 1) / result.sections.length) * 100),
          ),
        });
      })
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : 'Okuma bağlantısı açılamadı.'),
      );
  }, [slug]);

  useEffect(() => {
    if (!visitor || !reading) return;
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void post(`/v1/readings/public/${encodeURIComponent(slug)}/heartbeat`, {
        visitorId: visitor,
      }).catch(() => undefined);
    }, 60_000);
    return () => window.clearInterval(heartbeat);
  }, [reading, slug, visitor]);

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
    await post(`/v1/readings/public/${encodeURIComponent(slug)}/progress`, {
      visitorId: visitor,
      sectionPosition: next + 1,
      progressPercent: Math.round(((next + 1) / reading.sections.length) * 100),
    }).catch(() => undefined);
  }

  async function finish() {
    setBusy(true);
    setError(undefined);
    try {
      await post(`/v1/readings/public/${encodeURIComponent(slug)}/complete`, {
        visitorId: visitor,
      });
      setCompleted(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Tamamlama bilgisi kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  }

  async function openPdf() {
    setBusy(true);
    try {
      const result = await fetch(`${api}/v1/readings/public/${encodeURIComponent(slug)}/pdf`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ visitorId: visitor }),
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

  function trackWhatsappClick() {
    if (!visitor) return;
    void fetch(`${api}/v1/readings/public/${encodeURIComponent(slug)}/whatsapp-click`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ visitorId: visitor }),
      keepalive: true,
    }).catch(() => undefined);
  }

  function whatsappHref(message: string) {
    return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
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
    <main className="public-reader public-social-reader">
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
          <p>Okumana hoş geldin</p>
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
          {reading.author ? (
            <small className="public-reading-author">{reading.author}</small>
          ) : null}
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

          <aside className="public-reading-private-lesson">
            <div>
              <span>Birebir meditasyon</span>
              <h3>Okuduklarını kendi pratiğinde derinleştirmek ister misin?</h3>
              <p>
                Sana uygun bir pratik düzeni oluşturmak ve süreci birlikte takip etmek için birebir
                çalışabiliriz.
              </p>
            </div>
            <a
              href={whatsappHref(
                `Merhaba Necip, “${reading.title}” okumasının “${section.title}” bölümünü okudum. Birebir meditasyon dersleri hakkında bilgi almak istiyorum.`,
              )}
              target="_blank"
              rel="noopener noreferrer"
              onClick={trackWhatsappClick}
            >
              <MessageCircle aria-hidden="true" />
              Bilgi al
            </a>
          </aside>

          {sectionIndex === reading.sections.length - 1 ? (
            <section className="public-reading-reflection public-reading-finish">
              {completed ? (
                <div className="public-reading-complete">
                  <span>
                    <Check aria-hidden="true" />
                  </span>
                  <div>
                    <h3>Okumayı tamamladın</h3>
                    <p>Buraya ayırdığın zaman için teşekkür ederim.</p>
                  </div>
                </div>
              ) : (
                <>
                  <span>Okumanın sonu</span>
                  <h3>Okumayı tamamladığında ilerlemeni kaydedebilirsin.</h3>
                  {error ? <p className="public-reading-error">{error}</p> : null}
                  <button type="button" onClick={() => void finish()} disabled={busy}>
                    <Check aria-hidden="true" />
                    {busy ? 'Kaydediliyor...' : 'Okumayı tamamla'}
                  </button>
                </>
              )}
              <a
                className="public-reading-whatsapp"
                href={whatsappHref(
                  `Merhaba Necip, “${reading.title}” okuması hakkında düşüncemi paylaşmak istiyorum.`,
                )}
                target="_blank"
                rel="noopener noreferrer"
                onClick={trackWhatsappClick}
              >
                <MessageCircle aria-hidden="true" />
                WhatsApp’tan düşünceni paylaş
              </a>
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
