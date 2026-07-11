'use client';
import { Alert, EmptyState, PageHeader, Skeleton } from '@meditation/ui';
import { CreditCard } from 'lucide-react';
import { useEffect, useState } from 'react';
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
type Payment = {
  id: string;
  referenceCode: string;
  status: string;
  amountMinor: string;
  reportedAt: string;
};
export default function PaymentsPage() {
  const [items, setItems] = useState<Payment[]>();
  const [error, setError] = useState(false);
  useEffect(() => {
    void fetch(`${api}/v1/admin/payments`, { credentials: 'include' })
      .then((r) => r.json())
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((v: { items: Payment[] }) => setItems(v.items))
      .catch(() => setError(true));
  }, []);
  return (
    <main className="content">
      <PageHeader
        title="Ödemeler"
        description="Bildirilen ödemeleri inceleyin ve paket aktivasyonunu yönetin"
      />
      <section className="section">
        {error ? (
          <Alert tone="danger">Ödemeler yüklenemedi. Sayfayı yenileyerek tekrar deneyin.</Alert>
        ) : !items ? (
          <Skeleton />
        ) : items.length === 0 ? (
          <EmptyState icon={CreditCard} title="Ödeme bildirimi yok" />
        ) : (
          <div className="conversation-list">
            {items.map((p) => (
              <div key={p.id}>
                <strong>{p.referenceCode}</strong>
                <span>
                  {p.status} ·{' '}
                  {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(
                    Number(p.amountMinor) / 100,
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
