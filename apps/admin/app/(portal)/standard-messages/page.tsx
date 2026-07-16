'use client';

import { Alert, Badge, Button, EmptyState, PageHeader, Skeleton, Toast } from '@meditation/ui';
import {
  Archive,
  Check,
  Code2,
  Eye,
  FileQuestion,
  FileText,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

type EventDef = {
  key: string;
  audience: string;
  protected: boolean;
  complianceClass: string;
  channels: string[];
  defaultContent?: string;
  variableSchema: { properties: Record<string, { type: string }>; required: string[] };
};
type Version = {
  id: string;
  version: number;
  status: string;
  content: string;
  expertApproved: boolean;
};
type Variant = {
  id: string;
  channel: string;
  locale: string;
  priority: number;
  curriculumStage?: string;
  slot?: string;
  versions: Version[];
};
type Message = {
  id: string;
  eventKey: string;
  name: string;
  protected: boolean;
  variants: Variant[];
};
type View = 'DEFINED' | 'DEFAULTS' | 'UNDEFINED';

const groups = [
  ['KAYIT VE İZİNLER', ['REGISTRATION_', 'PRIVACY_', 'CONSENT_', 'NAME_', 'CHANNEL_OPT_IN']],
  ['ÖDEME VE ÜYELİK', ['PAYMENT_', 'SUBSCRIPTION_', 'STUDENT_ACTIVATED']],
  ['PRATİKLER', ['PRACTICE_']],
  ['GÖRÜŞMELER', ['MEETING_', 'MEET_LINK']],
  [
    'DESTEK VE BİLGİ',
    ['KNOWLEDGE_', 'HANDOFF_', 'AGENT_', 'UNKNOWN_', 'WEEKLY_', 'STUDENT_CONTEXT'],
  ],
  ['KANALLAR', ['CHANNEL_', 'MESSAGING_', 'UNSUPPORTED_MEDIA', 'DEFAULT_CHANNEL']],
  ['GÜVENLİK VE VERİ', ['SAFETY_', 'DELETION_']],
  ['ADMİN BİLDİRİMLERİ', ['ADMIN_']],
] as const;
const titleReplacements: Array<[string, string]> = [
  ['REGISTRATION', 'Kayıt'],
  ['PRIVACY NOTICE', 'KVKK bildirimi'],
  ['CHANNEL OPT IN', 'Kanal izni'],
  ['AGENT REPLY AI CONSENT', 'AI yanıt izni'],
  ['NAME REQUEST', 'Ad soyad isteği'],
  ['PAYMENT INSTRUCTIONS', 'Ödeme bilgileri'],
  ['PAYMENT REPORTED', 'Ödeme bildirimi alındı'],
  ['PAYMENT APPROVED', 'Ödeme onaylandı'],
  ['PAYMENT ACTION REQUIRED', 'Ödeme için ek bilgi gerekli'],
  ['STUDENT ACTIVATED', 'Öğrenci aktifleşti'],
  ['PRACTICE PLAN', 'Pratik planı'],
  ['PRACTICE REMINDER', 'Pratik hatırlatması'],
  ['PRACTICE CHECKIN', 'Pratik geri bildirimi'],
  ['PRACTICE REFLECTION REQUEST', 'Pratik refleksiyonu isteği'],
  ['PRACTICE COMPLETED ACK', 'Pratik tamamlandı yanıtı'],
  ['PRACTICE SKIPPED ACK', 'Pratik yapılamadı yanıtı'],
  ['PRACTICE PAUSED', 'Pratikler duraklatıldı'],
  ['PRACTICE RESUMED', 'Pratikler devam ettirildi'],
  ['MEETING SERIES SCHEDULED', 'Görüşme serisi planlandı'],
  ['MEETING SCHEDULED', 'Görüşme planlandı'],
  ['MEETING REMINDER 24H', 'Görüşmeye 24 saat kaldı'],
  ['MEETING REMINDER 1H', 'Görüşmeye 1 saat kaldı'],
  ['MEETING RESCHEDULED', 'Görüşme saati değişti'],
  ['MEETING CANCELLED', 'Görüşme iptal edildi'],
  ['MEETING COMPLETED', 'Görüşme tamamlandı'],
  ['MEETING NO SHOW', 'Öğrenci görüşmeye katılmadı'],
  ['HANDOFF', 'Admin yönlendirmesi'],
  ['KNOWLEDGE NOT FOUND', 'Bilgi bankasında yanıt bulunamadı'],
];

function eventGroup(key: string) {
  return (
    groups.find(([, prefixes]) => prefixes.some((prefix) => key.startsWith(prefix)))?.[0] ?? 'DİĞER'
  );
}
function eventTitle(key: string) {
  const normalized = key.replaceAll('_', ' ');
  const match = titleReplacements.find(([source]) => normalized.startsWith(source));
  if (!match)
    return normalized
      .toLocaleLowerCase('tr-TR')
      .replace(/^./, (value) => value.toLocaleUpperCase('tr-TR'));
  return normalized
    .replace(match[0], match[1])
    .toLocaleLowerCase('tr-TR')
    .replace(/^./, (value) => value.toLocaleUpperCase('tr-TR'));
}
function eventDescription(event: EventDef) {
  const receiver = event.audience === 'ADMIN' ? 'yöneticiye' : 'öğrenciye';
  return `Bu olay gerçekleştiğinde ${receiver} ${event.channels.join(' / ')} üzerinden mesaj gönderilebilir.`;
}

export default function StandardMessagesPage() {
  const [events, setEvents] = useState<EventDef[]>();
  const [messages, setMessages] = useState<Message[]>();
  const [selected, setSelected] = useState<EventDef>();
  const [activeVariant, setActiveVariant] = useState<Variant>();
  const [view, setView] = useState<View>('DEFINED');
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState<string>();
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger' | 'info'; text: string }>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(undefined);
    try {
      const [eventsResponse, messagesResponse] = await Promise.all([
        fetch(`${api}/v1/admin/system-events`, { credentials: 'include', cache: 'no-store' }),
        fetch(`${api}/v1/admin/standard-messages`, { credentials: 'include', cache: 'no-store' }),
      ]);
      if (!eventsResponse.ok || !messagesResponse.ok)
        throw new Error(`HTTP ${eventsResponse.status}/${messagesResponse.status}`);
      const eventItems = ((await eventsResponse.json()) as { items: EventDef[] }).items;
      const messageItems = ((await messagesResponse.json()) as { items: Message[] }).items;
      setEvents(eventItems);
      setMessages(messageItems);
      setSelected((current) =>
        current ? eventItems.find((item) => item.key === current.key) : eventItems[0],
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Mesaj kataloğu yüklenemedi.');
    }
  }, []);
  useEffect(() => void load(), [load]);

  const definitionCounts = useMemo(() => {
    const defined = new Set((messages ?? []).map((message) => message.eventKey));
    return {
      defined: (events ?? []).filter((event) => defined.has(event.key)).length,
      defaults: (events ?? []).filter((event) => event.defaultContent).length,
      undefined: (events ?? []).filter((event) => !defined.has(event.key)).length,
    };
  }, [events, messages]);
  const filteredEvents = useMemo(() => {
    const defined = new Set((messages ?? []).map((message) => message.eventKey));
    const query = search.trim().toLocaleLowerCase('tr-TR');
    return (events ?? []).filter((event) => {
      const matchesView =
        view === 'DEFINED'
          ? defined.has(event.key)
          : view === 'DEFAULTS'
            ? Boolean(event.defaultContent)
            : !defined.has(event.key);
      return (
        matchesView &&
        (!query ||
          event.key.toLocaleLowerCase('tr-TR').includes(query) ||
          eventTitle(event.key).toLocaleLowerCase('tr-TR').includes(query))
      );
    });
  }, [events, messages, search, view]);
  const groupedEvents = useMemo(() => {
    const result = new Map<string, EventDef[]>();
    for (const event of filteredEvents) {
      const group = eventGroup(event.key);
      result.set(group, [...(result.get(group) ?? []), event]);
    }
    return result;
  }, [filteredEvents]);
  const related = useMemo(
    () => (messages ?? []).filter((message) => message.eventKey === selected?.key),
    [messages, selected],
  );

  async function mutate(path: string, body?: unknown, method = 'POST') {
    setBusy(true);
    try {
      const response = await fetch(`${api}/v1/admin/${path}`, {
        method,
        credentials: 'include',
        headers:
          body === undefined
            ? { 'x-csrf-token': sessionStorage.getItem('admin_csrf_token') ?? '' }
            : {
                'content-type': 'application/json',
                'x-csrf-token': sessionStorage.getItem('admin_csrf_token') ?? '',
              },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error((payload as { message?: string }).message ?? `HTTP ${response.status}`);
      setNotice({ tone: 'success', text: 'Değişiklik kaydedildi.' });
      await load();
      return payload;
    } catch (reason) {
      setNotice({
        tone: 'danger',
        text: reason instanceof Error ? reason.message : 'İşlem tamamlanamadı.',
      });
    } finally {
      setBusy(false);
    }
  }
  async function quickCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const result = await mutate('standard-messages/quick', {
      eventKey: selected.key,
      name: data.get('name'),
      channel: data.get('channel'),
      locale: 'tr-TR',
      content: data.get('content'),
      expertApproved: data.get('expertApproved') === 'on',
    });
    if (result) form.reset();
  }
  async function createVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeVariant) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    await mutate(`standard-message-variants/${activeVariant.id}/versions`, {
      content: data.get('content'),
      expertApproved: data.get('expertApproved') === 'on',
    });
    form.reset();
  }
  async function showPreview(content: string) {
    if (!selected) return;
    const variables = Object.fromEntries(
      Object.keys(selected.variableSchema.properties).map((key) => [key, `[${key}]`]),
    );
    const response = await fetch(`${api}/v1/admin/standard-message-versions/preview`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': sessionStorage.getItem('admin_csrf_token') ?? '',
      },
      body: JSON.stringify({ eventKey: selected.key, content, variables }),
    });
    const value = await response.json();
    if (!response.ok) {
      setNotice({ tone: 'danger', text: value.message ?? 'Önizleme üretilemedi.' });
      return;
    }
    setPreview(value.rendered);
  }

  return (
    <main className="content">
      <PageHeader
        title="Mesaj Şablonları"
        description="Öğrenci ve admin mesajlarını olay, kanal ve yayın durumuna göre yönetin"
        actions={
          <Button variant="secondary" onClick={() => void load()}>
            <RefreshCw aria-hidden="true" /> Yenile
          </Button>
        }
      />
      {notice ? (
        <Toast tone={notice.tone} onDismiss={() => setNotice(undefined)}>
          {notice.text}
        </Toast>
      ) : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {!events || !messages ? (
        <Skeleton />
      ) : (
        <>
          <nav className="catalog-view-tabs" aria-label="Mesaj tanım durumu">
            <button data-active={view === 'DEFINED'} onClick={() => setView('DEFINED')}>
              <FileText aria-hidden="true" /> Tanımlı <small>{definitionCounts.defined}</small>
            </button>
            <button data-active={view === 'DEFAULTS'} onClick={() => setView('DEFAULTS')}>
              <Code2 aria-hidden="true" /> Kod varsayılanları{' '}
              <small>{definitionCounts.defaults}</small>
            </button>
            <button data-active={view === 'UNDEFINED'} onClick={() => setView('UNDEFINED')}>
              <FileQuestion aria-hidden="true" /> Tanımsız{' '}
              <small>{definitionCounts.undefined}</small>
            </button>
          </nav>
          <div className="catalog-layout catalog-layout--guided">
            <aside className="event-list event-list--grouped">
              <label className="catalog-search">
                <Search aria-hidden="true" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Mesaj olayı ara"
                />
              </label>
              {[...groupedEvents.entries()].map(([group, items]) => (
                <section key={group}>
                  <strong>{group}</strong>
                  {items.map((item) => (
                    <button
                      data-selected={selected?.key === item.key}
                      key={item.key}
                      onClick={() => {
                        setSelected(item);
                        setActiveVariant(undefined);
                        setPreview(undefined);
                      }}
                    >
                      <span>
                        <b>{eventTitle(item.key)}</b>
                        <small>{item.key}</small>
                      </span>
                      {item.protected ? <Badge tone="warning">Korumalı</Badge> : null}
                    </button>
                  ))}
                </section>
              ))}
              {!filteredEvents.length ? <EmptyState title="Bu görünümde olay yok" /> : null}
            </aside>

            <section className="catalog-detail">
              {selected ? (
                <>
                  <header className="catalog-event-header">
                    <div>
                      <span className="eyebrow">{eventGroup(selected.key)}</span>
                      <h2>{eventTitle(selected.key)}</h2>
                      <p>{eventDescription(selected)}</p>
                      <code>{selected.key}</code>
                    </div>
                    <div className="catalog-event-status">
                      <Badge tone={related.length ? 'success' : 'warning'}>
                        {related.length ? `${related.length} DB tanımı` : 'Tanımsız'}
                      </Badge>
                      {selected.defaultContent ? (
                        <Badge tone="info">Kod varsayılanı var</Badge>
                      ) : null}
                    </div>
                  </header>

                  <div className="variable-list">
                    <strong>Kullanılabilir değişkenler</strong>
                    {Object.keys(selected.variableSchema.properties).length ? (
                      Object.entries(selected.variableSchema.properties).map(([key, value]) => (
                        <code key={key}>
                          {`{{${key}}}`} · {value.type}
                          {selected.variableSchema.required.includes(key) ? ' · zorunlu' : ''}
                        </code>
                      ))
                    ) : (
                      <span>Bu mesaj değişken kullanmıyor.</span>
                    )}
                  </div>

                  {selected.defaultContent ? (
                    <section className="code-default-message">
                      <div className="section-heading">
                        <div>
                          <span className="eyebrow">KODDA TANIMLI</span>
                          <h3>Sistem varsayılanı</h3>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void showPreview(selected.defaultContent!)}
                        >
                          <Eye aria-hidden="true" /> Önizle
                        </Button>
                      </div>
                      <p>{selected.defaultContent}</p>
                      <small>
                        Uygulama başlarken DB’ye düşük öncelikli sistem varsayılanı olarak
                        senkronlanır.
                      </small>
                    </section>
                  ) : null}
                  {preview ? <Alert title="Mesaj önizlemesi">{preview}</Alert> : null}

                  <details className="quick-message-definition" open={!related.length}>
                    <summary>
                      <Plus aria-hidden="true" /> Yeni mesaj tanımla
                    </summary>
                    <form onSubmit={quickCreate}>
                      <label className="ui-field">
                        <span className="ui-field__label">Tanım adı</span>
                        <input
                          className="ui-input"
                          name="name"
                          placeholder="Örn. Samimi pratik hatırlatması"
                          required
                        />
                      </label>
                      <label className="ui-field">
                        <span className="ui-field__label">Kanal</span>
                        <select className="ui-input" name="channel" defaultValue="WHATSAPP">
                          <option value="WHATSAPP">WhatsApp</option>
                          <option value="TELEGRAM">Telegram</option>
                          <option value="EMAIL">E-posta</option>
                          <option value="ADMIN_PANEL">Admin panel</option>
                        </select>
                      </label>
                      <label className="ui-field quick-message-content">
                        <span className="ui-field__label">Mesaj içeriği</span>
                        <textarea
                          className="ui-input"
                          name="content"
                          required
                          placeholder="Mesajı ve gerekli {{değişkenleri}} yazın..."
                        />
                      </label>
                      <label className="check-field">
                        <input type="checkbox" name="expertApproved" /> Uzman onaylı
                      </label>
                      <Button type="submit" loading={busy}>
                        <Plus aria-hidden="true" /> Taslak oluştur
                      </Button>
                    </form>
                  </details>

                  <div className="catalog-messages catalog-messages--readable">
                    {related.map((message) => (
                      <article key={message.id}>
                        <div>
                          <span>
                            <strong>
                              {message.name === 'Sistem varsayilani'
                                ? 'Sistem varsayılanı'
                                : message.name}
                            </strong>
                            <small>{message.variants.length} kanal varyantı</small>
                          </span>
                          {message.name !== 'Sistem varsayilani' ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Tanımı sil"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    'Bu özel mesaj tanımı ve taslak sürümleri silinsin mi?',
                                  )
                                )
                                  void mutate(
                                    `standard-messages/${message.id}`,
                                    undefined,
                                    'DELETE',
                                  );
                              }}
                            >
                              <Trash2 aria-hidden="true" /> Sil
                            </Button>
                          ) : (
                            <Badge tone="neutral">Kod tarafından yönetilir</Badge>
                          )}
                        </div>
                        <div className="variant-list">
                          {message.variants.map((variant) => {
                            const published = variant.versions.find(
                              (version) => version.status === 'PUBLISHED',
                            );
                            return (
                              <button
                                className="variant-row"
                                data-selected={activeVariant?.id === variant.id}
                                key={variant.id}
                                onClick={() => {
                                  setActiveVariant(variant);
                                  setPreview(undefined);
                                }}
                              >
                                <span>
                                  <strong>
                                    {variant.channel} · {variant.locale}
                                  </strong>
                                  <small>
                                    {published
                                      ? `Yayında: v${published.version}`
                                      : 'Yayınlanmış sürüm yok'}{' '}
                                    · öncelik {variant.priority}
                                  </small>
                                </span>
                                <Badge tone={published ? 'success' : 'warning'}>
                                  {variant.versions.length} sürüm
                                </Badge>
                              </button>
                            );
                          })}
                        </div>
                      </article>
                    ))}
                  </div>

                  {activeVariant ? (
                    <section className="version-editor">
                      <div className="section-heading">
                        <div>
                          <span className="eyebrow">SÜRÜM YÖNETİMİ</span>
                          <h3>
                            {activeVariant.channel} · {activeVariant.locale}
                          </h3>
                        </div>
                        <Badge>{activeVariant.versions.length}</Badge>
                      </div>
                      <form onSubmit={createVersion}>
                        <label className="ui-field">
                          <span className="ui-field__label">Yeni sürüm içeriği</span>
                          <textarea name="content" className="ui-input catalog-textarea" required />
                        </label>
                        <label className="check-field">
                          <input type="checkbox" name="expertApproved" /> Uzman onaylı
                        </label>
                        <Button type="submit" loading={busy}>
                          <Plus aria-hidden="true" /> Taslak oluştur
                        </Button>
                      </form>
                      <div className="version-list">
                        {[...activeVariant.versions]
                          .sort((a, b) => b.version - a.version)
                          .map((version) => (
                            <div key={version.id}>
                              <span>
                                <strong>v{version.version}</strong>
                                <Badge
                                  tone={
                                    version.status === 'PUBLISHED'
                                      ? 'success'
                                      : version.status === 'ARCHIVED'
                                        ? 'neutral'
                                        : 'warning'
                                  }
                                >
                                  {version.status}
                                </Badge>
                              </span>
                              <p>{version.content}</p>
                              <div className="row-actions">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => void showPreview(version.content)}
                                >
                                  <Eye aria-hidden="true" /> Önizle
                                </Button>
                                {version.status !== 'PUBLISHED' ? (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    loading={busy}
                                    onClick={() =>
                                      void mutate(`standard-message-versions/${version.id}/publish`)
                                    }
                                  >
                                    <Send aria-hidden="true" /> Yayınla
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    loading={busy}
                                    onClick={() =>
                                      void mutate(`standard-message-versions/${version.id}/archive`)
                                    }
                                  >
                                    <Archive aria-hidden="true" /> Arşivle
                                  </Button>
                                )}
                                {version.expertApproved ? (
                                  <Badge tone="success">
                                    <Check aria-hidden="true" /> Onaylı
                                  </Badge>
                                ) : null}
                              </div>
                            </div>
                          ))}
                      </div>
                    </section>
                  ) : null}
                </>
              ) : null}
            </section>
          </div>
        </>
      )}
    </main>
  );
}
