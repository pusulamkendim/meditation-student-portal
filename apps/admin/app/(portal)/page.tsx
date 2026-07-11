import { Activity, CircleDollarSign, LifeBuoy, Users } from 'lucide-react';
import { Badge, EmptyState, Metric, PageHeader } from '@meditation/ui';

export default function HomePage() {
  return (
    <main className="content">
      <PageHeader
        title="Genel Bakış"
        description="Öğrenci ve operasyon durumlarının güncel özeti"
      />

      <section className="metrics" aria-label="Temel metrikler">
        <Metric label="Aktif öğrenci" value={0} icon={Users} detail="Bu ay" />
        <Metric label="Ödeme incelemesi" value={0} icon={CircleDollarSign} detail="Bekleyen" />
        <Metric label="Bugünkü pratik" value={0} icon={Activity} detail="Planlanan" />
        <Metric label="Açık destek" value={0} icon={LifeBuoy} detail="Yanıt bekleyen" />
      </section>

      <section className="section">
        <div className="section-heading">
          <h2>Operasyon kuyruğu</h2>
          <Badge tone="success">Bekleyen işlem yok</Badge>
        </div>
        <EmptyState
          title="Kuyruk temiz"
          description="Yeni ödeme, destek veya güvenlik bildirimi bulunmuyor."
        />
      </section>
    </main>
  );
}
