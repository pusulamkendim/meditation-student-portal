'use client';

import Link from 'next/link';
import Image from 'next/image';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  ChartNoAxesCombined,
  ExternalLink,
  Eye,
  FileText,
  ImageOff,
  MessageCircle,
  RefreshCw,
  Send,
  Users,
} from 'lucide-react';
import { Alert, Badge, Button, EmptyState, SegmentedControl, Skeleton } from '@meditation/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

type SiteRange = '7d' | '30d' | '90d';
type ContentFilter = 'ALL' | 'READING' | 'MEDITATION';

type SiteMetric = {
  value: number;
  previous: number;
  changePercent: number | null;
};

type SiteContent = {
  type: 'READING' | 'MEDITATION';
  id: string;
  slug: string | null;
  title: string;
  publishedAt: string | null;
  coverImageUrl: string | null;
  totalViews: number;
  uniqueVisitors: number;
  completionRate: number;
  adminHref: string;
};

type SiteOverview = {
  range: SiteRange;
  summary: {
    sessions: SiteMetric;
    pageViews: SiteMetric;
    contentViews: SiteMetric;
    ctaClicks: SiteMetric;
  };
  daily: Array<{
    date: string;
    sessions: number;
    contentViews: number;
    ctaClicks: number;
  }>;
  funnel: {
    sessions: number;
    contentViews: number;
    oneToOneViews: number;
    conversionClicks: number;
    conversionEvents: number;
    rates: {
      sessions: number | null;
      contentViews: number | null;
      oneToOneViews: number | null;
      conversionClicks: number | null;
    };
  };
  content: SiteContent[];
  trafficSources: Array<{ source: string; sessions: number }>;
  attention: Array<{
    kind: 'DRAFT_CONTENT' | 'MISSING_COVER' | 'STALE_PUBLISHING';
    title: string;
    detail: string;
    href: string;
  }>;
  recentContent: Array<{
    type: 'READING' | 'MEDITATION';
    id: string;
    title: string;
    publishedAt: string;
    adminHref: string;
  }>;
  generatedAt: string;
};

const rangeOptions = [
  { value: '7d' as const, label: '7 gün' },
  { value: '30d' as const, label: '30 gün' },
  { value: '90d' as const, label: '90 gün' },
];

const contentFilterOptions = [
  { value: 'ALL' as const, label: 'Tümü' },
  { value: 'READING' as const, label: 'Okumalar' },
  { value: 'MEDITATION' as const, label: 'Meditasyonlar' },
];

function formatNumber(value: number) {
  return new Intl.NumberFormat('tr-TR').format(value);
}

function formatDate(value: string | null | undefined, includeTime = false) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'medium',
    ...(includeTime ? { timeStyle: 'short' as const } : {}),
    timeZone: 'Europe/Istanbul',
  }).format(new Date(value));
}

function formatDay(value: string) {
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/Istanbul',
  }).format(new Date(`${value}T12:00:00`));
}

function formatPercent(value: number | null) {
  return value === null
    ? '—'
    : `%${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(value)}`;
}

function contentTypeLabel(type: SiteContent['type']) {
  return type === 'READING' ? 'Okuma' : 'Meditasyon';
}

function comparisonText(metric: SiteMetric) {
  if (metric.changePercent === null) return '— · Önceki dönem verisi yok';
  if (metric.changePercent === 0) return '→ Değişmedi';
  return `${metric.changePercent > 0 ? '↑' : '↓'} %${Math.abs(metric.changePercent)} · Önceki dönem`;
}

function comparisonTone(metric: SiteMetric) {
  if (metric.changePercent === null || metric.changePercent === 0) return 'flat';
  return metric.changePercent > 0 ? 'up' : 'down';
}

function SiteMetricCard({
  label,
  metric,
  icon: Icon,
}: {
  label: string;
  metric: SiteMetric;
  icon: typeof Users;
}) {
  return (
    <article className="site-overview-kpi">
      <span className="site-overview-kpi-label">
        <Icon aria-hidden="true" />
        <span>{label}</span>
      </span>
      <strong>{formatNumber(metric.value)}</strong>
      <small className={`site-overview-comparison is-${comparisonTone(metric)}`}>
        {comparisonText(metric)}
      </small>
    </article>
  );
}

function PanelHeading({
  number,
  title,
  description,
  action,
}: {
  number: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="studio-section-heading site-overview-panel-heading">
      <div>
        <span aria-hidden="true">{number}</span>
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      {action}
    </header>
  );
}

function InteractionChart({ daily }: { daily: SiteOverview['daily'] }) {
  if (!daily.length) {
    return (
      <div className="site-overview-chart-empty">
        <ChartNoAxesCombined aria-hidden="true" />
        <div>
          <strong>Henüz ziyaret verisi yok.</strong>
          <p>Ziyaretler geldikçe günlük hareket ve trafik kaynakları burada görünecek.</p>
        </div>
      </div>
    );
  }

  const width = 760;
  const height = 238;
  const left = 36;
  const right = 12;
  const top = 18;
  const bottom = 32;
  const max = Math.max(
    1,
    ...daily.flatMap((item) => [item.sessions, item.contentViews, item.ctaClicks]),
  );
  const x = (index: number) =>
    daily.length === 1
      ? (width + left - right) / 2
      : left + (index / (daily.length - 1)) * (width - left - right);
  const y = (value: number) => top + (1 - value / max) * (height - top - bottom);
  const points = (
    key: keyof Pick<SiteOverview['daily'][number], 'sessions' | 'contentViews' | 'ctaClicks'>,
  ) => daily.map((item, index) => `${x(index)},${y(item[key])}`).join(' ');
  const labelStep = Math.max(1, Math.ceil(daily.length / 6));

  return (
    <div className="site-overview-chart-wrap">
      <svg
        className="site-overview-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Oturum, içerik açılışı ve CTA günlük eğilim grafiği"
      >
        {[0, 0.5, 1].map((ratio) => {
          const lineY = top + ratio * (height - top - bottom);
          return (
            <g key={ratio}>
              <line
                className="site-overview-grid-line"
                x1={left}
                x2={width - right}
                y1={lineY}
                y2={lineY}
              />
              <text className="site-overview-y-label" x={left - 8} y={lineY + 4} textAnchor="end">
                {formatNumber(Math.round(max * (1 - ratio)))}
              </text>
            </g>
          );
        })}
        <polyline className="site-overview-line is-sessions" points={points('sessions')} />
        <polyline className="site-overview-line is-content" points={points('contentViews')} />
        <polyline className="site-overview-line is-cta" points={points('ctaClicks')} />
        {daily.map((item, index) =>
          index % labelStep === 0 || index === daily.length - 1 ? (
            <text
              className="site-overview-x-label"
              key={item.date}
              x={x(index)}
              y={height - 8}
              textAnchor="middle"
            >
              {formatDay(item.date)}
            </text>
          ) : null,
        )}
      </svg>
      <div className="site-overview-chart-legend" aria-label="Grafik açıklaması">
        <span>
          <i className="is-sessions" /> Oturum
        </span>
        <span>
          <i className="is-content" /> İçerik açılışı
        </span>
        <span>
          <i className="is-cta" /> CTA
        </span>
      </div>
    </div>
  );
}

function Funnel({ funnel }: { funnel: SiteOverview['funnel'] }) {
  const stages = [
    { label: 'Site oturumu', value: funnel.sessions, rate: funnel.rates.sessions },
    {
      label: 'İçerik görüntüleyen oturum',
      value: funnel.contentViews,
      rate: funnel.rates.contentViews,
    },
    {
      label: 'Birebir çalışma sayfasını görüntüleyen oturum',
      value: funnel.oneToOneViews,
      rate: funnel.rates.oneToOneViews,
    },
    {
      label: 'WhatsApp / Tanışma aksiyonu alan oturum',
      value: funnel.conversionClicks,
      rate: funnel.rates.conversionClicks,
    },
  ];
  const reference = Math.max(stages[0]?.value ?? 0, 1);

  return (
    <div className="site-overview-funnel">
      <div className="site-overview-funnel-stages">
        {stages.map((stage, index) => (
          <div className="site-overview-funnel-stage" key={stage.label}>
            <div className="site-overview-funnel-label">
              <span>{stage.label}</span>
              <span className="site-overview-funnel-values">
                <strong>{formatNumber(stage.value)}</strong>
                <small title={index === 0 ? 'Başlangıç' : 'Önceki aşamaya göre dönüşüm'}>
                  {index === 0
                    ? 'Başlangıç'
                    : stage.rate === null
                      ? '—'
                      : `%${stage.rate.toLocaleString('tr-TR')}`}
                </small>
              </span>
            </div>
            <div className="site-overview-funnel-track">
              <i style={{ width: `${Math.min(100, (stage.value / reference) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
      <p className="site-overview-funnel-note">
        Her aşamada tekil oturumlar sayılır. WhatsApp / Tanışma: toplam{' '}
        {formatNumber(funnel.conversionEvents)} tıklama.
      </p>
    </div>
  );
}

function contentImageUrl(path: string | null) {
  if (!path) return undefined;
  return path.startsWith('http') ? path : `${api}${path}`;
}

function ContentPerformance({ content }: { content: SiteContent[] }) {
  const [filter, setFilter] = useState<ContentFilter>('ALL');
  const filteredContent = useMemo(
    () => content.filter((item) => filter === 'ALL' || item.type === filter),
    [content, filter],
  );

  function openContent(item: SiteContent) {
    window.location.assign(item.adminHref);
  }

  return (
    <section className="site-overview-section site-overview-content-panel">
      <PanelHeading
        number="03"
        title="İçerik performansı"
        description="İçeriklerin paylaşım istatistikleri · Tüm zamanlar"
        action={
          <SegmentedControl
            label="İçerik türü filtresi"
            value={filter}
            options={contentFilterOptions}
            onChange={setFilter}
          />
        }
      />
      {filteredContent.length ? (
        <div className="site-overview-table-scroll">
          <table className="site-overview-table">
            <thead>
              <tr>
                <th>İçerik</th>
                <th>Tür</th>
                <th>Yayın tarihi*</th>
                <th>Toplam açılış</th>
                <th>
                  {filter === 'READING'
                    ? 'Tekil okuyucu'
                    : filter === 'MEDITATION'
                      ? 'Tekil ziyaretçi'
                      : 'Tekil okuyucu / ziyaretçi'}
                </th>
                <th>Tamamlama oranı</th>
              </tr>
            </thead>
            <tbody>
              {filteredContent.map((item) => (
                <tr
                  key={`${item.type}:${item.id}`}
                  tabIndex={0}
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest('a')) return;
                    openContent(item);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openContent(item);
                    }
                  }}
                >
                  <td>
                    <Link className="site-overview-content-title" href={item.adminHref}>
                      <span className="site-overview-cover">
                        {item.coverImageUrl ? (
                          <Image
                            src={contentImageUrl(item.coverImageUrl) ?? ''}
                            alt=""
                            width={38}
                            height={38}
                            loading="lazy"
                            unoptimized
                          />
                        ) : (
                          <ImageOff aria-hidden="true" />
                        )}
                      </span>
                      <span>
                        <strong title={item.title}>{item.title}</strong>
                      </span>
                    </Link>
                  </td>
                  <td>
                    <Badge tone={item.type === 'READING' ? 'info' : 'success'}>
                      {contentTypeLabel(item.type)}
                    </Badge>
                  </td>
                  <td>{formatDate(item.publishedAt)}</td>
                  <td className="site-overview-number-cell">{formatNumber(item.totalViews)}</td>
                  <td className="site-overview-number-cell">{formatNumber(item.uniqueVisitors)}</td>
                  <td className="site-overview-completion-cell">
                    <strong>{formatPercent(item.completionRate)}</strong>
                    <ExternalLink aria-hidden="true" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={BookOpen}
          title="Bu filtrede içerik yok"
          description="Yayınlanmış ve herkese açık bir içerik olduğunda performans burada görünür."
        />
      )}
      <p className="site-overview-footnote">
        Veriler tüm zamanların toplamıdır; üstteki tarih filtresinden bağımsızdır. * Yayın tarihi,
        içeriğin son güncelleme tarihini gösterir.
      </p>
    </section>
  );
}

function TrafficSources({ sources }: { sources: SiteOverview['trafficSources'] }) {
  const max = Math.max(1, ...sources.map((source) => source.sessions));
  return (
    <section className="site-overview-traffic-panel" aria-labelledby="site-traffic-title">
      <h3 id="site-traffic-title">Trafik kaynakları</h3>
      {sources.length ? (
        <div className="site-overview-source-list">
          {sources.map((source) => (
            <div className="site-overview-source-row" key={source.source}>
              <div>
                <span>{source.source}</span>
                <strong>{formatNumber(source.sessions)}</strong>
              </div>
              <i>
                <b style={{ width: `${(source.sessions / max) * 100}%` }} />
              </i>
            </div>
          ))}
        </div>
      ) : (
        <p className="site-overview-empty-note">Henüz trafik kaynağı yok.</p>
      )}
    </section>
  );
}

function Attention({ items }: { items: SiteOverview['attention'] }) {
  return (
    <section className="site-overview-section site-overview-attention-panel">
      <PanelHeading number="04" title="Dikkat gerektirenler" />
      {items.length ? (
        <div className="site-overview-attention-list">
          {items.map((item) => (
            <Link
              className="site-overview-attention-row"
              href={item.href}
              key={`${item.kind}:${item.title}`}
            >
              <AlertTriangle aria-hidden="true" />
              <span>
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </span>
              <ArrowRight aria-hidden="true" />
            </Link>
          ))}
        </div>
      ) : (
        <p className="site-overview-empty-note">Şu an dikkat gerektiren bir durum yok.</p>
      )}
    </section>
  );
}

function RecentContent({ items }: { items: SiteOverview['recentContent'] }) {
  return (
    <section className="site-overview-section site-overview-recent-panel">
      <PanelHeading number="05" title="Son yayınlanan içerikler" />
      {items.length ? (
        <div className="site-overview-recent-list">
          {items.map((item) => (
            <Link href={item.adminHref} key={`${item.type}:${item.id}`}>
              <span className="site-overview-recent-icon">
                {item.type === 'READING' ? (
                  <FileText aria-hidden="true" />
                ) : (
                  <MessageCircle aria-hidden="true" />
                )}
              </span>
              <span>
                <strong>{item.title}</strong>
                <small>
                  {contentTypeLabel(item.type)} · {formatDate(item.publishedAt)}
                </small>
              </span>
              <ArrowRight aria-hidden="true" />
            </Link>
          ))}
        </div>
      ) : (
        <p className="site-overview-empty-note">Henüz yayınlanmış içerik yok.</p>
      )}
    </section>
  );
}

export default function SiteOverviewPage() {
  const [range, setRange] = useState<SiteRange>('30d');
  const [data, setData] = useState<SiteOverview>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string>();

  const load = useCallback(
    async (quiet = false) => {
      if (quiet) setRefreshing(true);
      else setLoading(true);
      setError(undefined);
      try {
        const response = await fetch(`${api}/v1/admin/site-overview?range=${range}`, {
          credentials: 'include',
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error((payload as { message?: string }).message ?? `HTTP ${response.status}`);
        }
        setData(payload as SiteOverview);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Site analitiği yüklenemedi.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [range],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="content site-overview-page">
      <header className="studio-dashboard-intro site-overview-header">
        <div>
          <span>GENEL PERFORMANS</span>
          <h1>Site &amp; İçerik</h1>
          <p>Genel performans, içerik analitiği ve dönüşüm özeti.</p>
        </div>
        <div className="site-overview-toolbar">
          <SegmentedControl
            label="Analitik tarih aralığı"
            value={range}
            options={rangeOptions}
            onChange={setRange}
          />
          {data ? (
            <span className="site-overview-updated">
              Son güncelleme: {formatDate(data.generatedAt, true)}
            </span>
          ) : null}
          <Button
            variant="secondary"
            size="icon"
            aria-label="Site analitiğini yenile"
            title="Yenile"
            loading={refreshing}
            onClick={() => void load(true)}
          >
            <RefreshCw aria-hidden="true" />
          </Button>
        </div>
      </header>

      {error && data ? (
        <Alert tone="danger" title="Site analitiği güncellenemedi">
          {error}
        </Alert>
      ) : null}
      {error && !data ? (
        <div className="site-overview-error">
          <Alert tone="danger" title="Site analitiği yüklenemedi">
            {error}
          </Alert>
          <Button variant="secondary" onClick={() => void load()}>
            {' '}
            <RefreshCw aria-hidden="true" /> Yeniden dene
          </Button>
        </div>
      ) : loading && !data ? (
        <div className="site-overview-loading" aria-busy="true">
          <div className="studio-pulse site-overview-kpi-grid">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} />
            ))}
          </div>
          <div className="site-overview-loading-grid">
            <Skeleton />
            <Skeleton />
          </div>
          <Skeleton />
        </div>
      ) : data ? (
        <>
          <section className="studio-pulse site-overview-kpi-grid" aria-label="Site özeti">
            <SiteMetricCard label="Tekil oturum" metric={data.summary.sessions} icon={Users} />
            <SiteMetricCard label="Sayfa görüntüleme" metric={data.summary.pageViews} icon={Eye} />
            <SiteMetricCard
              label="İçerik açılışı"
              metric={data.summary.contentViews}
              icon={BookOpen}
            />
            <SiteMetricCard label="CTA tıklamaları" metric={data.summary.ctaClicks} icon={Send} />
          </section>

          <div className="site-overview-analysis-grid">
            <section className="site-overview-section site-overview-chart-panel">
              <PanelHeading
                number="01"
                title="Ziyaretler ve etkileşim"
                description="Seçili dönemde ziyaretler, içerik açılışları ve iletişim tıklamaları."
              />
              <InteractionChart daily={data.daily} />
              <TrafficSources sources={data.trafficSources} />
            </section>
            <section className="site-overview-section site-overview-funnel-panel">
              <PanelHeading
                number="02"
                title="Dönüşüm hunisi"
                description="Ziyaretten iletişime uzanan adımlar; oranlar bir önceki aşamaya göredir."
              />
              <Funnel funnel={data.funnel} />
            </section>
          </div>
          <ContentPerformance content={data.content} />

          <div className="site-overview-editorial-grid">
            <Attention items={data.attention} />
            <RecentContent items={data.recentContent} />
          </div>
        </>
      ) : null}
    </main>
  );
}
