'use client';
import { MessageSquareText } from 'lucide-react';
import { EmptyState, PageHeader, Skeleton } from '@meditation/ui';
import { useEffect, useState } from 'react';
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
type Conversation = {
  id: string;
  status: string;
  messages: Array<{ occurredAt: string; direction: string; status: string }>;
};
export default function ConversationsPage() {
  const [items, setItems] = useState<Conversation[]>();
  useEffect(() => {
    void fetch(`${api}/v1/admin/conversations`, { credentials: 'include' })
      .then((r) => r.json())
      .then((v: { items: Conversation[] }) => setItems(v.items));
  }, []);
  return (
    <main className="content">
      <PageHeader title="Konuşmalar" description="WhatsApp ve Telegram öğrenci konuşmaları" />
      <section className="section">
        {!items ? (
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
                <strong>Öğrenci {item.id.slice(0, 8)}</strong>
                <span>
                  {item.messages[0]?.direction} · {item.messages[0]?.status}
                </span>
              </a>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
