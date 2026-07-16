'use client';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  MessageBubble,
  PageHeader,
  Skeleton,
} from '@meditation/ui';
import { ArrowLeft, Send } from 'lucide-react';
import { useParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
const statusLabels: Record<string, string> = {
  PENDING: 'Bekliyor',
  CLAIMED: 'İşleniyor',
  FAILED: 'Gönderilemedi',
  DELIVERY_UNKNOWN: 'Teslim durumu belirsiz',
  SUPPRESSED: 'Gönderilmedi',
};
const intentLabels: Record<string, string> = {
  PRACTICE_CHECKIN: 'Pratik geri bildirimi',
  PRACTICE_REMINDER: 'Pratik hatırlatması',
  MEETING_REMINDER: 'Görüşme hatırlatması',
  ADMIN_REPLY: 'Admin yanıtı',
  SYSTEM_STANDARD_MESSAGE: 'Sistem mesajı',
};
const suppressionLabels: Record<string, string> = {
  WHATSAPP_TEMPLATE_REQUIRED: 'WhatsApp 24 saat penceresi kapalı; onaylı template gerekli.',
  STUDENT_INACTIVE: 'Öğrenci aktif olmadığı için gönderilmedi.',
  PROACTIVE_MESSAGING_PAUSED: 'Öğrencinin proaktif mesajları duraklatılmış.',
};
type Data = {
  student: {
    id: string;
    fullName?: string;
    status: string;
    channel?: { type: string; status: string; lastInboundAt?: string };
  };
  items: Array<{
    id: string;
    direction: string;
    status: string;
    occurredAt: string;
    content?: string;
    context?: { eventKey?: string; resolutionMethod: string };
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
  const timelineRef = useRef<HTMLElement>(null);
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
  useEffect(() => {
    const timeline = timelineRef.current;
    if (timeline && data?.items.length) timeline.scrollTop = timeline.scrollHeight;
  }, [data?.items.length]);
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
  const groupedIntents = (() => {
    const groups = new Map<
      string,
      { category: string; status: string; reason?: string; count: number; createdAt: string }
    >();
    for (const intent of data.intents) {
      const key = `${intent.category}:${intent.status}:${intent.suppressionReason ?? ''}`;
      const current = groups.get(key);
      if (current) current.count += 1;
      else
        groups.set(key, {
          category: intent.category,
          status: intent.status,
          reason: intent.suppressionReason,
          count: 1,
          createdAt: intent.createdAt,
        });
    }
    return [...groups.values()];
  })();
  return (
    <main className="content">
      <a className="back-link" href="/conversations">
        <ArrowLeft />
        Konuşmalar
      </a>
      <PageHeader
        title={data.student.fullName ?? `İsimsiz öğrenci · ${studentId.slice(0, 8)}`}
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
        <section className="message-timeline" ref={timelineRef}>
          {data.items.length === 0 ? (
            <EmptyState title="Henüz mesaj yok" />
          ) : (
            <>
              {data.items.map((item) => (
                <MessageBubble
                  key={item.id}
                  direction={item.direction === 'OUTBOUND' ? 'outbound' : 'inbound'}
                  channel={item.status}
                  time={new Date(item.occurredAt).toLocaleString('tr-TR')}
                >
                  <div>
                    {item.content ?? 'İçerik mevcut değil'}
                    {item.context?.eventKey ? (
                      <small className="message-context-label">
                        Bağlam: {item.context.eventKey} · {item.context.resolutionMethod}
                      </small>
                    ) : null}
                  </div>
                </MessageBubble>
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
          {groupedIntents.length ? (
            <details className="conversation-operations">
              <summary>Teknik gönderim kayıtları ({data.intents.length})</summary>
              <small>Benzer kayıtlar tek satırda gruplanmıştır.</small>
              {groupedIntents.map((intent) => (
                <div key={`${intent.category}:${intent.status}:${intent.reason ?? ''}`}>
                  <span>
                    {intentLabels[intent.category] ?? intent.category}
                    {intent.count > 1 ? ` · ${intent.count} kez` : ''}
                  </span>
                  <Badge tone={intent.status === 'FAILED' ? 'danger' : 'warning'}>
                    {statusLabels[intent.status] ?? intent.status}
                  </Badge>
                  <small>{new Date(intent.createdAt).toLocaleString('tr-TR')}</small>
                  {intent.reason ? (
                    <small>{suppressionLabels[intent.reason] ?? intent.reason}</small>
                  ) : null}
                </div>
              ))}
            </details>
          ) : null}
        </aside>
      </div>
    </main>
  );
}
