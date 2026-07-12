'use client';
import { Alert, Badge, EmptyState, PageHeader, Skeleton } from '@meditation/ui';
import { Search, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
type Student = {
  id: string;
  status: string;
  registrationStep: string;
  curriculumStage: string;
  channel?: string;
  createdAt: string;
  subscription?: { status: string; endExclusive: string };
  counts: { payments: number; practiceSessions: number };
};
const tone: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  ACTIVE: 'success',
  PAYMENT_PENDING: 'warning',
  PAUSED: 'info',
  INACTIVE: 'neutral',
  DELETION_PENDING: 'danger',
};
export default function StudentsPage() {
  const [items, setItems] = useState<Student[]>();
  const [error, setError] = useState<string>();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('ALL');
  useEffect(() => {
    void fetch(`${api}/v1/admin/students`, { credentials: 'include', cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((v: { items: Student[] }) => setItems(v.items))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Bağlantı hatası'));
  }, []);
  const visible = useMemo(
    () =>
      (items ?? []).filter(
        (s) =>
          (filter === 'ALL' || s.status === filter) &&
          s.id.toLowerCase().includes(query.toLowerCase()),
      ),
    [items, query, filter],
  );
  return (
    <main className="content">
      <PageHeader
        title="Öğrenciler"
        description="Kayıt, üyelik, kanal ve pratik durumlarını yönetin"
      />
      <div className="payment-toolbar">
        <label className="payment-search">
          <Search />
          <input
            aria-label="Öğrenci ara"
            placeholder="Öğrenci referansı ara"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="payment-filters">
          {[
            ['ALL', 'Tümü'],
            ['ACTIVE', 'Aktif'],
            ['PAYMENT_PENDING', 'Ödeme bekliyor'],
            ['INACTIVE', 'Pasif'],
          ].map(([v, l]) => (
            <button key={v} aria-pressed={filter === v} onClick={() => setFilter(v)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {error ? (
        <Alert tone="danger">Öğrenciler yüklenemedi: {error}</Alert>
      ) : !items ? (
        <div className="preview-stack">
          <Skeleton />
          <Skeleton />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState icon={Users} title="Eşleşen öğrenci yok" />
      ) : (
        <div className="student-table">
          <div className="student-table__head">
            <span>Öğrenci</span>
            <span>Kanal</span>
            <span>Kayıt aşaması</span>
            <span>Paket bitişi</span>
            <span>Durum</span>
          </div>
          {visible.map((s) => (
            <a className="student-row" href={`/students/${s.id}`} key={s.id}>
              <strong>{s.id.slice(0, 8)}</strong>
              <span>{s.channel ?? 'Bağlanmadı'}</span>
              <span>{s.registrationStep}</span>
              <span>
                {s.subscription
                  ? new Date(s.subscription.endExclusive).toLocaleDateString('tr-TR')
                  : 'Paket yok'}
              </span>
              <Badge tone={tone[s.status] ?? 'neutral'}>{s.status}</Badge>
            </a>
          ))}
        </div>
      )}
    </main>
  );
}
