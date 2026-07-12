'use client';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  PageHeader,
  Skeleton,
  TextField,
  Toast,
} from '@meditation/ui';
import { Archive, Check, Eye, FileText, Plus, RefreshCw, Send } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
type EventDef = {
  key: string;
  audience: string;
  protected: boolean;
  complianceClass: string;
  channels: string[];
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
  requiresStudentName: boolean;
  versions: Version[];
  providerBinding?: { templateName: string; status: string };
};
type Message = {
  id: string;
  eventKey: string;
  name: string;
  protected: boolean;
  variants: Variant[];
};
type Notice = { tone: 'success' | 'danger' | 'info'; text: string };

export default function StandardMessagesPage() {
  const [events, setEvents] = useState<EventDef[]>();
  const [messages, setMessages] = useState<Message[]>();
  const [selected, setSelected] = useState<EventDef>();
  const [activeVariant, setActiveVariant] = useState<Variant>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<Notice>();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string>();
  const load = useCallback(async () => {
    setError(undefined);
    try {
      const [e, m] = await Promise.all([
        fetch(`${api}/v1/admin/system-events`, { credentials: 'include' }),
        fetch(`${api}/v1/admin/standard-messages`, { credentials: 'include' }),
      ]);
      if (!e.ok || !m.ok) throw new Error(`HTTP ${e.status}/${m.status}`);
      const ev = (await e.json()) as { items: EventDef[] };
      const mv = (await m.json()) as { items: Message[] };
      setEvents(ev.items);
      setMessages(mv.items);
      setSelected((c) => c ?? ev.items[0]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Katalog yüklenemedi');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const related = useMemo(
    () => (messages ?? []).filter((m) => m.eventKey === selected?.key),
    [messages, selected],
  );
  async function mutate(path: string, body?: unknown, method = 'POST') {
    setBusy(true);
    try {
      const response = await fetch(`${api}/v1/admin/${path}`, {
        method,
        credentials: 'include',
        headers: {
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
  async function createMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    await mutate('standard-messages', {
      eventKey: selected!.key,
      name: new FormData(form).get('name'),
    });
    form.reset();
  }
  async function createVariant(event: FormEvent<HTMLFormElement>, messageId: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await mutate(`standard-messages/${messageId}/variants`, {
      channel: data.get('channel'),
      locale: data.get('locale'),
      stage: data.get('stage') || undefined,
      slot: data.get('slot') || undefined,
      priority: Number(data.get('priority') ?? 0),
      requiresStudentName: data.get('requiresStudentName') === 'on',
    });
    form.reset();
  }
  async function createVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await mutate(`standard-message-variants/${activeVariant!.id}/versions`, {
      content: data.get('content'),
      expertApproved: data.get('expertApproved') === 'on',
    });
    form.reset();
  }
  async function showPreview(content: string) {
    const variables = Object.fromEntries(
      Object.keys(selected!.variableSchema.properties).map((key) => [key, `[${key}]`]),
    );
    setBusy(true);
    try {
      const response = await fetch(`${api}/v1/admin/standard-message-versions/preview`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': sessionStorage.getItem('admin_csrf_token') ?? '',
        },
        body: JSON.stringify({ eventKey: selected!.key, content, variables }),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.message);
      setPreview(value.rendered);
    } catch (reason) {
      setNotice({
        tone: 'danger',
        text: reason instanceof Error ? reason.message : 'Önizleme üretilemedi.',
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="content">
      <PageHeader
        title="Mesaj Şablonları"
        description="Event, kanal varyantı ve yayın sürümlerini tek yerden yönetin"
        actions={
          <Button variant="secondary" onClick={() => void load()}>
            <RefreshCw />
            Yenile
          </Button>
        }
      />
      {notice ? (
        <div className="toast-region">
          <Toast tone={notice.tone} onDismiss={() => setNotice(undefined)}>
            {notice.text}
          </Toast>
        </div>
      ) : null}
      {error ? (
        <Alert tone="danger">{error}</Alert>
      ) : !events ? (
        <Skeleton />
      ) : (
        <div className="catalog-layout">
          <aside className="event-list">
            <strong>System events</strong>
            {events.map((item) => (
              <button
                data-selected={selected?.key === item.key}
                key={item.key}
                onClick={() => {
                  setSelected(item);
                  setActiveVariant(undefined);
                  setPreview(undefined);
                }}
              >
                <span>{item.key}</span>
                {item.protected ? <Badge tone="warning">Korumalı</Badge> : null}
              </button>
            ))}
          </aside>
          <section className="catalog-detail">
            {selected ? (
              <>
                <header>
                  <div>
                    <h2>{selected.key}</h2>
                    <p>
                      {selected.audience} · {selected.complianceClass} ·{' '}
                      {selected.channels.join(', ')}
                    </p>
                  </div>
                </header>
                <div className="variable-list">
                  <strong>İzinli değişkenler</strong>
                  {Object.keys(selected.variableSchema.properties).length ? (
                    Object.entries(selected.variableSchema.properties).map(([key, value]) => (
                      <code key={key}>
                        {`{{${key}}}`} · {value.type}
                        {selected.variableSchema.required.includes(key) ? ' · zorunlu' : ''}
                      </code>
                    ))
                  ) : (
                    <span>Bu event değişken kabul etmiyor.</span>
                  )}
                </div>
                <form className="catalog-create" onSubmit={createMessage}>
                  <TextField
                    name="name"
                    label="Yeni mesaj tanımı"
                    placeholder="Varsayılan Türkçe mesaj"
                    required
                  />
                  <Button type="submit" loading={busy}>
                    <Plus />
                    Tanım oluştur
                  </Button>
                </form>
                <div className="catalog-messages">
                  {related.length ? (
                    related.map((message) => (
                      <article key={message.id}>
                        <div>
                          <strong>{message.name}</strong>
                          <Badge>{message.variants.length} varyant</Badge>
                        </div>
                        <form
                          className="variant-create"
                          onSubmit={(e) => createVariant(e, message.id)}
                        >
                          <label>
                            Kanal
                            <select name="channel" defaultValue="WHATSAPP">
                              <option>WHATSAPP</option>
                              <option>TELEGRAM</option>
                              <option>EMAIL</option>
                            </select>
                          </label>
                          <TextField name="locale" label="Dil" defaultValue="tr-TR" />
                          <label>
                            Aşama
                            <select name="stage" defaultValue="">
                              <option value="">Tümü</option>
                              <option>WEEK_1</option>
                              <option>WEEK_2</option>
                              <option>WEEK_3</option>
                              <option>WEEK_4</option>
                              <option>INTERMEDIATE</option>
                              <option>ADVANCED</option>
                            </select>
                          </label>
                          <TextField name="slot" label="Slot" placeholder="MORNING" />
                          <TextField
                            name="priority"
                            label="Öncelik"
                            type="number"
                            defaultValue="0"
                          />
                          <label className="check-field">
                            <input type="checkbox" name="requiresStudentName" /> Öğrenci adı zorunlu
                          </label>
                          <Button type="submit" size="sm" loading={busy}>
                            <Plus />
                            Varyant
                          </Button>
                        </form>
                        {message.variants.map((variant) => (
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
                                {variant.curriculumStage ?? 'Tüm aşamalar'} · öncelik{' '}
                                {variant.priority}
                              </small>
                            </span>
                            <Badge
                              tone={
                                variant.versions.some((v) => v.status === 'PUBLISHED')
                                  ? 'success'
                                  : 'neutral'
                              }
                            >
                              {variant.versions.length} sürüm
                            </Badge>
                          </button>
                        ))}
                      </article>
                    ))
                  ) : (
                    <EmptyState
                      icon={FileText}
                      title="Mesaj tanımı yok"
                      description="Bu event için ilk mesaj tanımını oluşturun."
                    />
                  )}
                </div>
                {activeVariant ? (
                  <section className="version-editor">
                    <div className="section-heading">
                      <h3>
                        {activeVariant.channel} · {activeVariant.locale} sürümleri
                      </h3>
                      <Badge>{activeVariant.versions.length}</Badge>
                    </div>
                    <form onSubmit={createVersion}>
                      <label className="ui-field">
                        <span className="ui-field__label">Mesaj içeriği</span>
                        <textarea
                          name="content"
                          className="ui-input catalog-textarea"
                          placeholder="Merhaba {{studentDisplayName}}..."
                          required
                        />
                      </label>
                      <label className="check-field">
                        <input type="checkbox" name="expertApproved" /> Uzman onaylı
                      </label>
                      <Button type="submit" loading={busy}>
                        <Plus />
                        Taslak oluştur
                      </Button>
                    </form>
                    {preview ? <Alert title="Önizleme">{preview}</Alert> : null}
                    <div className="version-list">
                      {activeVariant.versions
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
                                <Eye />
                                Önizle
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
                                  <Send />
                                  Yayınla
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
                                  <Archive />
                                  Arşivle
                                </Button>
                              )}
                              {version.expertApproved ? (
                                <Badge tone="success">
                                  <Check />
                                  Onaylı
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
      )}
    </main>
  );
}
