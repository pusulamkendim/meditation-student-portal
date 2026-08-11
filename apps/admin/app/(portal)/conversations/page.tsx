'use client';
import {
  ArrowRight,
  BookOpen,
  CircleUserRound,
  ExternalLink,
  Inbox,
  MessageSquareText,
  Radio,
  RefreshCw,
  UserRoundX,
} from 'lucide-react';
import { Alert, Badge, Button, EmptyState, PageHeader, Skeleton } from '@meditation/ui';
import { useEffect, useMemo, useState } from 'react';
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
type Conversation = {
  id: string;
  fullName?: string;
  status: string;
  messages: Array<{ occurredAt: string; direction: string; status: string }>;
  messageIntents: Array<{ createdAt: string; category: string; status: string }>;
  channel?: { type: string; status: string };
};
type InboxThread = {
  id: string;
  studentId?: string;
  fullName?: string;
  channel: string;
  contact?: string;
  content?: string;
  occurredAt: string;
  inboundCount: number;
  readingInquiry: boolean;
  meditationInquiry: boolean;
};
type View = 'conversations' | 'inbox';
type InboxFilter = 'all' | 'meditation' | 'reading' | 'unregistered';

function whatsappHref(contact: string) {
  const normalized = contact.replace(/\D/gu, '');
  return normalized ? `https://wa.me/${normalized}` : undefined;
}

const directionLabels: Record<string, string> = {
  INBOUND: 'Öğrenciden geldi',
  OUTBOUND: 'Öğrenciye gönderildi',
};

const deliveryLabels: Record<string, string> = {
  CLAIMED: 'İşleniyor',
  DELIVERED: 'Teslim edildi',
  FAILED: 'Gönderilemedi',
  PENDING: 'Bekliyor',
  SENT: 'Gönderildi',
  SUPPRESSED: 'Bastırıldı',
};

const categoryLabels: Record<string, string> = {
  PRACTICE_CHECKIN: 'Pratik geri bildirimi',
  PRACTICE_REMINDER: 'Pratik hatırlatması',
  REGISTRATION_RESPONSE: 'Kayıt yanıtı',
  ADMIN_REPLY: 'Admin yanıtı',
};

export default function ConversationsPage() {
  const [items, setItems] = useState<Conversation[]>();
  const [inboxItems, setInboxItems] = useState<InboxThread[]>();
  const [error, setError] = useState<string>();
  const [view, setView] = useState<View>('inbox');
  const [filter, setFilter] = useState<InboxFilter>('all');
  async function load() {
    setError(undefined);
    try {
      const [conversationsResponse, inboxResponse] = await Promise.all([
        fetch(`${api}/v1/admin/conversations`, { credentials: 'include' }),
        fetch(`${api}/v1/admin/conversations/inbox`, { credentials: 'include' }),
      ]);
      if (!conversationsResponse.ok || !inboxResponse.ok)
        throw new Error(`HTTP ${conversationsResponse.status}/${inboxResponse.status}`);
      const [conversationsPayload, inboxPayload] = (await Promise.all([
        conversationsResponse.json(),
        inboxResponse.json(),
      ])) as [{ items: Conversation[] }, { items: InboxThread[] }];
      setItems(conversationsPayload.items);
      setInboxItems(inboxPayload.items);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Konuşmalar yüklenemedi.');
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const filteredInbox = useMemo(() => {
    if (!inboxItems) return undefined;
    if (filter === 'meditation') return inboxItems.filter((item) => item.meditationInquiry);
    if (filter === 'reading') return inboxItems.filter((item) => item.readingInquiry);
    if (filter === 'unregistered') return inboxItems.filter((item) => !item.studentId);
    return inboxItems;
  }, [filter, inboxItems]);
  const overview = useMemo(() => {
    const inbox = inboxItems ?? [];
    const whatsapp = inbox.filter((item) => item.channel === 'WHATSAPP').length;
    const telegram = inbox.filter((item) => item.channel === 'TELEGRAM').length;
    return {
      conversations: items?.length ?? 0,
      inbound: inbox.length,
      unregistered: inbox.filter((item) => !item.studentId).length,
      contentInterest: inbox.filter((item) => item.readingInquiry || item.meditationInquiry).length,
      whatsapp,
      telegram,
      channelTotal: Math.max(1, whatsapp + telegram),
    };
  }, [inboxItems, items]);
  return (
    <main className="content conversations-page">
      <PageHeader
        title="Konuşmalar"
        description="WhatsApp ve Telegram öğrenci konuşmaları"
        actions={
          <Button variant="secondary" onClick={() => void load()}>
            <RefreshCw />
            Yenile
          </Button>
        }
      />
      <div className="conversation-view-tabs" role="tablist" aria-label="Konuşma görünümleri">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'inbox'}
          className={view === 'inbox' ? 'is-active' : undefined}
          onClick={() => setView('inbox')}
        >
          <Inbox aria-hidden="true" />
          Gelen kutusu
          <span>{inboxItems?.length ?? 0}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'conversations'}
          className={view === 'conversations' ? 'is-active' : undefined}
          onClick={() => setView('conversations')}
        >
          <MessageSquareText aria-hidden="true" />
          Öğrenci konuşmaları
          <span>{items?.length ?? 0}</span>
        </button>
      </div>
      <div className="conversation-hub">
        <section className="section conversation-inbox-section">
          {error ? (
            <Alert tone="danger" title="Konuşmalar yüklenemedi">
              {error}
            </Alert>
          ) : !items || !inboxItems ? (
            <div className="preview-stack">
              <Skeleton />
              <Skeleton />
            </div>
          ) : view === 'inbox' ? (
            <>
              <div className="conversation-inbox-toolbar">
                <div>
                  <button
                    type="button"
                    className={filter === 'all' ? 'is-active' : undefined}
                    onClick={() => setFilter('all')}
                  >
                    Tümü
                  </button>
                  <button
                    type="button"
                    className={filter === 'meditation' ? 'is-active' : undefined}
                    onClick={() => setFilter('meditation')}
                  >
                    Meditasyondan gelenler
                  </button>
                  <button
                    type="button"
                    className={filter === 'reading' ? 'is-active' : undefined}
                    onClick={() => setFilter('reading')}
                  >
                    <BookOpen aria-hidden="true" />
                    Okumadan gelenler
                  </button>
                  <button
                    type="button"
                    className={filter === 'unregistered' ? 'is-active' : undefined}
                    onClick={() => setFilter('unregistered')}
                  >
                    Kayıtlı olmayanlar
                  </button>
                </div>
                <small>Gönderici başına en son gelen mesaj gösterilir.</small>
              </div>
              {filteredInbox?.length === 0 ? (
                <EmptyState
                  icon={Inbox}
                  title="Bu filtrede mesaj yok"
                  description="Yeni mesajlar geldiğinde burada görünecek."
                />
              ) : (
                <div className="conversation-inbox-list">
                  {filteredInbox?.map((item) => {
                    const directWhatsapp =
                      item.channel === 'WHATSAPP' && item.contact
                        ? whatsappHref(item.contact)
                        : undefined;
                    const href = item.studentId
                      ? `/conversations/${item.studentId}`
                      : directWhatsapp;
                    const content = (
                      <>
                        <div className="conversation-inbox-avatar" aria-hidden="true">
                          {item.fullName?.slice(0, 1).toLocaleUpperCase('tr-TR') ?? '?'}
                        </div>
                        <div>
                          <div>
                            <strong>
                              {item.fullName ??
                                (item.contact
                                  ? `Kayıtlı değil · ${item.contact}`
                                  : 'Kayıtlı değil')}
                            </strong>
                            {item.readingInquiry ? (
                              <Badge tone="success">Okuma ilgisi</Badge>
                            ) : null}
                            {item.meditationInquiry ? (
                              <Badge tone="success">Meditasyon ilgisi</Badge>
                            ) : null}
                          </div>
                          <p>{item.content ?? 'Metin içermeyen mesaj'}</p>
                          <small>
                            {item.channel} · {new Date(item.occurredAt).toLocaleString('tr-TR')} ·{' '}
                            {item.inboundCount} gelen mesaj
                          </small>
                        </div>
                        {item.studentId ? (
                          <ArrowRight aria-hidden="true" />
                        ) : directWhatsapp ? (
                          <ExternalLink aria-hidden="true" />
                        ) : null}
                      </>
                    );
                    return href ? (
                      <a
                        key={item.id}
                        href={href}
                        target={item.studentId ? undefined : '_blank'}
                        rel={item.studentId ? undefined : 'noopener noreferrer'}
                      >
                        {content}
                      </a>
                    ) : (
                      <article key={item.id}>{content}</article>
                    );
                  })}
                </div>
              )}
            </>
          ) : items.length === 0 ? (
            <EmptyState
              icon={MessageSquareText}
              title="Konuşma yok"
              description="Yeni öğrenci mesajları burada görünecek."
            />
          ) : (
            <div className="conversation-list">
              {items.map((item) => {
                const message = item.messages[0];
                const intent = item.messageIntents[0];
                const activityAt = message?.occurredAt ?? intent?.createdAt;
                const activity = message
                  ? `${directionLabels[message.direction] ?? message.direction} · ${deliveryLabels[message.status] ?? message.status}`
                  : `${categoryLabels[intent?.category ?? ''] ?? intent?.category ?? 'Sistem kaydı'} · ${deliveryLabels[intent?.status ?? ''] ?? intent?.status ?? 'Bekliyor'}`;
                const fullName = item.fullName ?? `İsimsiz öğrenci · ${item.id.slice(0, 8)}`;
                return (
                  <a key={item.id} href={`/conversations/${item.id}`}>
                    <span className="conversation-inbox-avatar" aria-hidden="true">
                      {item.fullName?.slice(0, 1).toLocaleUpperCase('tr-TR') ?? '?'}
                    </span>
                    <span className="conversation-thread-copy">
                      <strong>{fullName}</strong>
                      <small>{activity}</small>
                      {activityAt ? (
                        <time>{new Date(activityAt).toLocaleString('tr-TR')}</time>
                      ) : null}
                    </span>
                    <Badge tone={item.channel?.status === 'ACTIVE' ? 'success' : 'neutral'}>
                      {item.channel?.type ?? 'KANAL YOK'}
                    </Badge>
                    <ArrowRight aria-hidden="true" />
                  </a>
                );
              })}
            </div>
          )}
        </section>

        <aside className="conversation-overview" aria-label="İletişim özeti">
          <header>
            <span>GÜNLÜK DURUM</span>
            <h2>İletişim özeti</h2>
            <p>Son mesajlar ve kanal dağılımı</p>
          </header>
          <div className="conversation-overview-metrics">
            <article>
              <MessageSquareText aria-hidden="true" />
              <span>Gelen kutusu</span>
              <strong>{overview.inbound}</strong>
            </article>
            <article>
              <CircleUserRound aria-hidden="true" />
              <span>Konuşmalar</span>
              <strong>{overview.conversations}</strong>
            </article>
            <article>
              <UserRoundX aria-hidden="true" />
              <span>Kayıtlı olmayan</span>
              <strong>{overview.unregistered}</strong>
            </article>
            <article>
              <BookOpen aria-hidden="true" />
              <span>İçerik ilgisi</span>
              <strong>{overview.contentInterest}</strong>
            </article>
          </div>
          <section className="conversation-channel-summary">
            <div>
              <Radio aria-hidden="true" />
              <strong>Kanal dağılımı</strong>
            </div>
            <span>
              <b>WhatsApp</b>
              <small>{overview.whatsapp}</small>
            </span>
            <i>
              <b style={{ width: `${(overview.whatsapp / overview.channelTotal) * 100}%` }} />
            </i>
            <span>
              <b>Telegram</b>
              <small>{overview.telegram}</small>
            </span>
            <i>
              <b style={{ width: `${(overview.telegram / overview.channelTotal) * 100}%` }} />
            </i>
          </section>
        </aside>
      </div>
    </main>
  );
}
