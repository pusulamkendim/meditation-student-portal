import { Check, Clock3, Sprout, X } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { CSSProperties } from 'react';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  title: 'Pratik karnesi · Sakin Zihin',
  description: 'Kişisel meditasyon pratiği değerlendirmesi.',
  robots: { index: false, follow: false },
};

type PublicReport = {
  type: 'WEEKLY' | 'MONTHLY';
  periodStart: string;
  periodEndExclusive: string;
  studentFirstName: string;
  snapshot: {
    practice: {
      current: {
        planned: number;
        completed: number;
        skipped: number;
        missed: number;
        awaitingResponse: number;
        completionRate: number;
      };
      maxCompletedDayStreak: number;
      days: Array<{
        date: string;
        sessions: Array<{ id: string; slot: string; status: string }>;
      }>;
    };
    subscription?: { packageWeek?: number } | null;
    meetings: Array<{ id: string; startsAt: string; status: string }>;
  };
  content: {
    subtitle: string;
    featuredReflectionQuote?: string;
    gentleObservation: string;
    supportPoint: string;
    weeklyEvaluation: string;
  };
};

const dateFormatter = new Intl.DateTimeFormat('tr-TR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export default async function StudentReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const response = await fetch(`${api}/v1/public/student-reports/${encodeURIComponent(token)}`, {
    cache: 'no-store',
  });
  if (!response.ok) notFound();
  const report = (await response.json()) as PublicReport;
  const facts = report.snapshot.practice.current;

  return (
    <main className="public-report-page">
      <div className="public-report-ambient" aria-hidden="true" />
      <div className="public-report-frame" aria-hidden="true" />
      <header className="public-report-brand">
        <span>
          <Sprout aria-hidden="true" /> Sakin Zihin
        </span>
        <small>{report.type === 'WEEKLY' ? 'Haftalık karne' : 'Aylık karne'}</small>
      </header>
      <article className="public-report-document">
        <header>
          <span className="public-report-kicker">Birebir pratik özeti</span>
          <h1>{report.studentFirstName}&apos;nin pratik karnesi</h1>
          <p>
            {formatRange(report.periodStart, report.periodEndExclusive)} · {report.content.subtitle}
          </p>
          <div>
            {report.snapshot.subscription?.packageWeek ? (
              <small>Aylık program · {report.snapshot.subscription.packageWeek}. hafta</small>
            ) : null}
            <small>{report.snapshot.practice.maxCompletedDayStreak} günlük devam serisi</small>
          </div>
        </header>

        <section className="public-report-score">
          <div
            className="public-report-ring"
            style={{ '--report-progress': `${facts.completionRate * 3.6}deg` } as CSSProperties}
          >
            <strong>%{facts.completionRate}</strong>
            <span>tamamlama</span>
          </div>
          <div>
            <h2>
              Planlanan {facts.planned} pratikten {facts.completed} tanesi tamamlandı.
            </h2>
            <div className="public-report-stats">
              <span>
                <b>{facts.planned}</b>Planlanan
              </span>
              <span>
                <b>{facts.completed}</b>Tamamlanan
              </span>
              <span>
                <b>{facts.skipped}</b>Yapılamadı
              </span>
              <span>
                <b>{facts.missed}</b>Geri dönüş yok
              </span>
            </div>
          </div>
        </section>

        <section>
          <div className="public-report-section-heading">
            <h2>Son {report.snapshot.practice.days.length} gün</h2>
            <span>Yerel saat</span>
          </div>
          <div className="public-report-days">
            {report.snapshot.practice.days.map((day) => (
              <div key={day.date} data-day-status={reportDayStatus(day.sessions)}>
                <strong>{new Date(`${day.date}T00:00:00`).getDate()}</strong>
                <span>
                  {new Intl.DateTimeFormat('tr-TR', { weekday: 'short' }).format(
                    new Date(`${day.date}T00:00:00`),
                  )}
                </span>
                <div>
                  {day.sessions.length ? (
                    day.sessions.map((session) => (
                      <i
                        key={session.id}
                        data-status={session.status}
                        title={`${session.slot} · ${statusLabel(session.status)}`}
                      >
                        {session.status === 'COMPLETED' ? (
                          <Check aria-hidden="true" />
                        ) : session.status === 'MISSED' || session.status === 'SKIPPED' ? (
                          <X aria-hidden="true" />
                        ) : (
                          <Clock3 aria-hidden="true" />
                        )}
                      </i>
                    ))
                  ) : (
                    <i data-status="EMPTY" aria-label="Bu gün için pratik yok">
                      <span aria-hidden="true">–</span>
                    </i>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="public-report-legend">
            <span>
              <i data-status="COMPLETED" /> Tamamlandı
            </span>
            <span>
              <i data-status="SKIPPED" /> Yapılamadı
            </span>
            <span>
              <i data-status="MISSED" /> Geri dönüş yok
            </span>
            <span>
              <i data-status="EMPTY" /> Plan yok
            </span>
          </div>
        </section>

        {report.content.featuredReflectionQuote ? (
          <blockquote>
            <span>Bu hafta öne çıkan deneyim</span>“{report.content.featuredReflectionQuote}”
          </blockquote>
        ) : null}

        <section className="public-report-observations">
          <div>
            <span>Nazik gözlem</span>
            <p>{report.content.gentleObservation}</p>
          </div>
          <div>
            <span>Destek noktası</span>
            <p>{report.content.supportPoint}</p>
          </div>
        </section>

        <section className="public-report-evaluation">
          <span>Hafta değerlendirmesi</span>
          <p>{report.content.weeklyEvaluation}</p>
        </section>

        <footer>
          Bu karne, paylaştığın deneyimler ve sistemdeki pratik kayıtları temel alınarak yargılayıcı
          olmayan bir dille hazırlanmıştır.
        </footer>
      </article>
    </main>
  );
}

function formatRange(start: string, endExclusive: string) {
  const end = new Date(`${endExclusive}T00:00:00`);
  end.setDate(end.getDate() - 1);
  return `${dateFormatter.format(new Date(`${start}T00:00:00`))} – ${dateFormatter.format(end)}`;
}

function statusLabel(status: string) {
  return (
    {
      COMPLETED: 'Tamamlandı',
      SKIPPED: 'Yapılamadı',
      MISSED: 'Geri dönüş yok',
      SCHEDULED: 'Planlandı',
      NO_SHOW: 'Katılınmadı',
      CANCELLED: 'İptal edildi',
    }[status] ?? 'Yanıt bekleniyor'
  );
}

function reportDayStatus(sessions: Array<{ status: string }>) {
  if (!sessions.length) return 'EMPTY';
  if (sessions.some((session) => session.status === 'MISSED')) return 'MISSED';
  if (sessions.some((session) => session.status === 'SKIPPED')) return 'SKIPPED';
  if (sessions.every((session) => session.status === 'COMPLETED')) return 'COMPLETED';
  return 'PENDING';
}
