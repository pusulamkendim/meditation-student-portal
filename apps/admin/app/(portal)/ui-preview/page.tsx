import { Bell, Plus, RefreshCw } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  MessageBubble,
  PageHeader,
  Skeleton,
  TextField,
} from '@meditation/ui';

export default function UiPreviewPage() {
  return (
    <main className="content">
      <PageHeader
        title="UI Sistemi"
        description="Ortak bileşenlerin ve sistem durumlarının canlı referansı"
        actions={
          <Button>
            <Plus aria-hidden="true" /> Yeni kayıt
          </Button>
        }
      />
      <div className="preview-grid">
        <section className="preview-section">
          <h2>Komutlar ve durumlar</h2>
          <div className="preview-row">
            <Button>Kaydet</Button>
            <Button variant="secondary">
              <RefreshCw aria-hidden="true" /> Yenile
            </Button>
            <Button variant="ghost">Vazgeç</Button>
            <Button variant="danger">Sil</Button>
          </div>
          <div className="preview-row">
            <Badge>Pasif</Badge>
            <Badge tone="success">Aktif</Badge>
            <Badge tone="warning">Bekliyor</Badge>
            <Badge tone="danger">Hata</Badge>
            <Badge tone="info">Bilgi</Badge>
          </div>
          <div className="preview-stack">
            <Alert tone="success" title="Ödeme onaylandı">
              Üyelik bir ay süreyle etkinleştirildi.
            </Alert>
            <Alert tone="warning" title="Yanıt bekleniyor">
              Öğrenci son pratik kontrolüne yanıt vermedi.
            </Alert>
          </div>
        </section>
        <section className="preview-section">
          <h2>Formlar</h2>
          <div className="preview-stack">
            <TextField label="Öğrenci adı" name="student-name" placeholder="Ad Soyad" />
            <TextField
              label="Telefon"
              name="phone"
              hint="Ülke koduyla birlikte girin."
              placeholder="+90 5xx xxx xx xx"
            />
            <TextField label="Hatalı alan" name="invalid" error="Bu alan zorunludur." />
          </div>
        </section>
        <section className="preview-section">
          <h2>Konuşma</h2>
          <div className="preview-stack">
            <MessageBubble direction="inbound" channel="WhatsApp" time="09:12">
              Bugünkü pratiğim kaç dakikaydı?
            </MessageBubble>
            <MessageBubble direction="outbound" channel="Agent" time="09:12">
              Bugünkü sabah pratiğiniz 20 dakika olarak planlandı.
            </MessageBubble>
          </div>
        </section>
        <section className="preview-section">
          <h2>Boş ve yükleniyor</h2>
          <div className="preview-stack">
            <Skeleton />
            <Skeleton className="preview-skeleton" />
            <EmptyState
              icon={Bell}
              title="Bildirim yok"
              description="Yeni bir operasyon bildirimi geldiğinde burada görünecek."
            />
          </div>
        </section>
      </div>
    </main>
  );
}
