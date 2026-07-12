'use client';

import { Alert, Badge, Button, EmptyState, PageHeader, Skeleton, TextField } from '@meditation/ui';
import { Check, CreditCard, FileText, RefreshCw, Search, X } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
type Payment = {
  id: string;
  studentId: string;
  referenceCode: string;
  status: string;
  amountMinor: string;
  currency: string;
  reportedAt: string;
  reviewNote?: string | null;
};
const tones: Record<string, 'neutral' | 'success' | 'warning' | 'danger' | 'info'> = {
  REPORTED: 'warning',
  UNDER_REVIEW: 'info',
  ACTION_REQUIRED: 'danger',
  APPROVED: 'success',
  REJECTED: 'neutral',
};
const labels: Record<string, string> = {
  REPORTED: 'Yeni bildirim',
  UNDER_REVIEW: 'İnceleniyor',
  ACTION_REQUIRED: 'Bilgi bekliyor',
  APPROVED: 'Onaylandı',
  REJECTED: 'Reddedildi',
};

export default function PaymentsPage() {
  const [items, setItems] = useState<Payment[]>();
  const [error, setError] = useState<string>();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('OPEN');
  const [selected, setSelected] = useState<Payment>();
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setError(undefined);
    try {
      const response = await fetch(`${api}/v1/admin/payments`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(`${response.status}: ${body.message ?? 'İstek başarısız'}`);
      }
      const value = (await response.json()) as { items: Payment[] };
      setItems(value.items);
      setSelected((current) =>
        current ? value.items.find((item) => item.id === current.id) : undefined,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Bağlantı hatası');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const visible = useMemo(
    () =>
      (items ?? []).filter(
        (item) =>
          (filter === 'ALL' ||
            (filter === 'OPEN'
              ? !['APPROVED', 'REJECTED'].includes(item.status)
              : item.status === filter)) &&
          `${item.referenceCode} ${item.studentId}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [items, filter, query],
  );
  async function mutate(path: string, body: object) {
    setBusy(true);
    setNotice(undefined);
    try {
      const response = await fetch(`${api}${path}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': sessionStorage.getItem('admin_csrf_token') ?? '',
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const value = await response.json().catch(() => ({}));
        throw new Error(value.message ?? `HTTP ${response.status}`);
      }
      setNotice('İşlem kaydedildi.');
      await load();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'İşlem tamamlanamadı.');
    } finally {
      setBusy(false);
    }
  }
  async function requestInfo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate(`/v1/admin/payments/${selected!.id}/action-required`, { note: form.get('note') });
  }
  async function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate(`/v1/admin/payments/${selected!.id}/approve`, {
      startDate: form.get('startDate') || undefined,
    });
  }
  return (
    <main className="content">
      <PageHeader
        title="Ödemeler"
        description="Bildirimleri inceleyin ve üyelik aktivasyonunu yönetin"
        actions={
          <Button variant="secondary" onClick={() => void load()}>
            <RefreshCw />
            Yenile
          </Button>
        }
      />
      {error ? <Alert tone="danger">Ödemeler yüklenemedi: {error}</Alert> : null}
      <div className="payment-toolbar">
        <label className="payment-search">
          <Search />
          <input
            aria-label="Ödemelerde ara"
            placeholder="Referans veya öğrenci ara"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="payment-filters">
          {[
            ['OPEN', 'Açık'],
            ['REPORTED', 'Yeni'],
            ['ACTION_REQUIRED', 'Bilgi bekliyor'],
            ['APPROVED', 'Onaylı'],
            ['ALL', 'Tümü'],
          ].map(([value, label]) => (
            <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {!items ? (
        <div className="preview-stack">
          <Skeleton />
          <Skeleton />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="Eşleşen ödeme yok"
          description="Filtre veya arama kriterlerini değiştirin."
        />
      ) : (
        <div className="payment-layout">
          <div className="payment-table" role="table">
            <div className="payment-table__head" role="row">
              <span>Referans</span>
              <span>Öğrenci</span>
              <span>Bildirim</span>
              <span>Tutar</span>
              <span>Durum</span>
            </div>
            {visible.map((item) => (
              <button
                className="payment-row"
                data-selected={selected?.id === item.id}
                key={item.id}
                onClick={() => {
                  setSelected(item);
                  setNotice(undefined);
                }}
              >
                <strong>{item.referenceCode}</strong>
                <span>{item.studentId.slice(0, 8)}</span>
                <span>{new Date(item.reportedAt).toLocaleDateString('tr-TR')}</span>
                <span>
                  {new Intl.NumberFormat('tr-TR', {
                    style: 'currency',
                    currency: item.currency,
                  }).format(Number(item.amountMinor) / 100)}
                </span>
                <Badge tone={tones[item.status] ?? 'neutral'}>
                  {labels[item.status] ?? item.status}
                </Badge>
              </button>
            ))}
          </div>
          {selected ? (
            <aside className="payment-detail">
              <header>
                <div>
                  <small>Ödeme incelemesi</small>
                  <h2>{selected.referenceCode}</h2>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Paneli kapat"
                  onClick={() => setSelected(undefined)}
                >
                  <X />
                </Button>
              </header>
              <dl>
                <div>
                  <dt>Öğrenci</dt>
                  <dd>{selected.studentId}</dd>
                </div>
                <div>
                  <dt>Tutar</dt>
                  <dd>
                    {new Intl.NumberFormat('tr-TR', {
                      style: 'currency',
                      currency: selected.currency,
                    }).format(Number(selected.amountMinor) / 100)}
                  </dd>
                </div>
                <div>
                  <dt>Bildirim zamanı</dt>
                  <dd>{new Date(selected.reportedAt).toLocaleString('tr-TR')}</dd>
                </div>
              </dl>
              <Button variant="secondary" disabled>
                <FileText />
                Dekont eklenmemiş
              </Button>
              {notice ? (
                <Alert tone={notice === 'İşlem kaydedildi.' ? 'success' : 'danger'}>{notice}</Alert>
              ) : null}
              {!['APPROVED', 'REJECTED'].includes(selected.status) ? (
                <>
                  <form className="payment-action" onSubmit={requestInfo}>
                    <TextField
                      name="note"
                      label="Ek bilgi talebi"
                      placeholder="Öğrenciye iletilecek kısa açıklama"
                      required
                    />
                    <Button variant="secondary" loading={busy} type="submit">
                      Bilgi iste
                    </Button>
                  </form>
                  <form className="payment-action" onSubmit={approve}>
                    <TextField
                      name="startDate"
                      label="Paket başlangıcı"
                      type="date"
                      hint="Boş bırakılırsa bugün başlar."
                    />
                    <Button loading={busy} type="submit">
                      <Check />
                      Ödemeyi onayla
                    </Button>
                  </form>
                </>
              ) : null}
            </aside>
          ) : null}
        </div>
      )}
    </main>
  );
}
