'use client';
import { ArrowRight, MessageSquareText, RefreshCw } from 'lucide-react';
import { Alert, Badge, Button, EmptyState, PageHeader, Skeleton } from '@meditation/ui';
import { useEffect, useState } from 'react';
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
type Conversation = {
  id: string;
  status: string;
  messages: Array<{ occurredAt: string; direction: string; status: string }>;
  messageIntents: Array<{ createdAt: string; category: string; status: string }>;
  channel?: { type: string; status: string };
};
export default function ConversationsPage() {
  const [items, setItems] = useState<Conversation[]>();
  const [error, setError] = useState<string>();
  async function load() {
    setError(undefined);
    try {
      const response = await fetch(`${api}/v1/admin/conversations`, { credentials: 'include' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setItems(((await response.json()) as { items: Conversation[] }).items);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Konuşmalar yüklenemedi.');
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <main className="content">
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
      <section className="section">
        {error ? (
          <Alert tone="danger" title="Konuşmalar yüklenemedi">
            {error}
          </Alert>
        ) : !items ? (
          <div className="preview-stack">
            <Skeleton />
            <Skeleton />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={MessageSquareText}
            title="Konuşma yok"
            description="Yeni öğrenci mesajları burada görünecek."
          />
        ) : (
          <div className="conversation-list">
            {items.map((item) => (
              <a key={item.id} href={`/conversations/${item.id}`}>
                <div>
                  <strong>Öğrenci {item.id.slice(0, 8)}</strong>
                  <span>
                    {item.messages[0]?.direction ?? item.messageIntents[0]?.category} ·{' '}
                    {item.messages[0]?.status ?? item.messageIntents[0]?.status}
                  </span>
                </div>
                <div>
                  <Badge tone={item.channel?.status === 'ACTIVE' ? 'success' : 'neutral'}>
                    {item.channel?.type ?? 'KANAL YOK'}
                  </Badge>
                  <ArrowRight />
                </div>
              </a>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
