'use client';
import { Alert, Badge, Button, EmptyState, PageHeader, Skeleton } from '@meditation/ui';
import { ArrowLeft, Send } from 'lucide-react';
import { useParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
type Data = {
  student: {
    id: string;
    status: string;
    channel?: { type: string; status: string; lastInboundAt?: string };
  };
  items: Array<{
    id: string;
    direction: string;
    status: string;
    occurredAt: string;
    content?: string;
  }>;
  intents: Array<{
    id: string;
    category: string;
    status: string;
    createdAt: string;
    suppressionReason?: string;
  }>;
};
export default function ConversationDetail() {
  const { studentId } = useParams<{ studentId: string }>();
  const [data, setData] = useState<Data>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const r = await fetch(`${api}/v1/admin/conversations/${studentId}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Konuşma yüklenemedi');
    }
  }, [studentId]);
  useEffect(() => {
    void load();
  }, [load]);
  async function reply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice(undefined);
    const form = event.currentTarget;
    try {
      const r = await fetch(`${api}/v1/admin/conversations/${studentId}/reply`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': sessionStorage.getItem('admin_csrf_token') ?? '',
        },
        body: JSON.stringify({ content: new FormData(form).get('content') }),
      });
      if (!r.ok) {
        const v = await r.json().catch(() => ({}));
        throw new Error(v.message ?? `HTTP ${r.status}`);
      }
      form.reset();
      setNotice('Yanıt gönderim kuyruğuna alındı.');
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Yanıt gönderilemedi');
    } finally {
      setBusy(false);
    }
  }
  if (error)
    return (
      <main className="content">
        <Alert tone="danger">{error}</Alert>
      </main>
    );
  if (!data)
    return (
      <main className="content">
        <Skeleton />
      </main>
    );
  const windowOpen = Boolean(
    data.student.channel?.type === 'WHATSAPP' &&
    data.student.channel.lastInboundAt &&
    Date.now() - new Date(data.student.channel.lastInboundAt).getTime() < 86400000,
  );
  return (
    <main className="content">
      <a className="back-link" href="/conversations">
        <ArrowLeft />
        Konuşmalar
      </a>
      <PageHeader
        title={`Öğrenci ${studentId.slice(0, 8)}`}
        description="Mesaj geçmişi ve kanal operasyonları"
        actions={
          <>
            <Badge tone={data.student.channel?.status === 'ACTIVE' ? 'success' : 'warning'}>
              {data.student.channel
                ? `${data.student.channel.type} · ${data.student.channel.status}`
                : 'Kanal yok'}
            </Badge>
            {data.student.channel?.type === 'WHATSAPP' ? (
              <Badge tone={windowOpen ? 'success' : 'warning'}>
                {windowOpen ? '24 saat açık' : 'Template gerekli'}
              </Badge>
            ) : null}
          </>
        }
      />
      <div className="conversation-workspace">
        <section className="message-timeline">
          {data.items.length === 0 && data.intents.length === 0 ? (
            <EmptyState title="Henüz mesaj yok" />
          ) : (
            <>
              {data.items.map((item) => (
                <article
                  className={`timeline-item timeline-item--${item.direction.toLowerCase()}`}
                  key={item.id}
                >
                  <strong>{item.direction === 'INBOUND' ? 'Öğrenci' : 'Sistem'}</strong>
                  <span>
                    {item.status} · {new Date(item.occurredAt).toLocaleString('tr-TR')}
                  </span>
                  {item.content ? <p>{item.content}</p> : <small>İçerik mevcut değil</small>}
                </article>
              ))}
              {data.intents.map((intent) => (
                <article className="timeline-intent" key={intent.id}>
                  <div>
                    <strong>{intent.category}</strong>
                    <span>{new Date(intent.createdAt).toLocaleString('tr-TR')}</span>
                  </div>
                  <Badge
                    tone={
                      intent.status === 'SENT'
                        ? 'success'
                        : intent.status === 'FAILED' || intent.status === 'SUPPRESSED'
                          ? 'danger'
                          : 'info'
                    }
                  >
                    {intent.status}
                  </Badge>
                  {intent.suppressionReason ? <small>{intent.suppressionReason}</small> : null}
                </article>
              ))}
            </>
          )}
        </section>
        <aside className="reply-panel">
          <h2>Yanıt gönder</h2>
          <p>Varsayılan kanal ve merkezi gönderim politikası kullanılır.</p>
          {notice ? (
            <Alert tone={notice.includes('kuyruğa') ? 'success' : 'danger'}>{notice}</Alert>
          ) : null}
          <form onSubmit={reply}>
            <label>
              <span>Mesaj</span>
              <textarea
                name="content"
                rows={6}
                maxLength={4096}
                required
                placeholder="Öğrenciye gönderilecek mesaj"
              />
            </label>
            <small>En fazla 4096 karakter</small>
            <Button type="submit" loading={busy} disabled={!data.student.channel}>
              <Send />
              Yanıtı kuyruğa al
            </Button>
          </form>
        </aside>
      </div>
    </main>
  );
}
