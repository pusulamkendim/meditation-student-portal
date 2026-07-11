'use client';
import { Button, EmptyState, PageHeader, TextField } from '@meditation/ui';
import { Send } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
type Item = { id: string; direction: string; status: string; occurredAt: string };
export default function ConversationDetailPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const [items, setItems] = useState<Item[]>([]);
  const load = () =>
    fetch(`${api}/v1/admin/conversations/${studentId}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((v: { items: Item[] }) => setItems(v.items));
  useEffect(() => {
    void load();
  }, [studentId]);
  async function reply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await fetch(`${api}/v1/admin/conversations/${studentId}/reply`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': sessionStorage.getItem('admin_csrf_token') ?? '',
      },
      body: JSON.stringify({ content: form.get('content') }),
    });
    event.currentTarget.reset();
  }
  return (
    <main className="content">
      <PageHeader title="Konuşma" description={`Öğrenci ${studentId.slice(0, 8)}`} />
      <section className="section">
        {items.length === 0 ? (
          <EmptyState title="Mesaj yok" />
        ) : (
          <div className="conversation-list">
            {items.map((item) => (
              <div key={item.id}>
                <strong>{item.direction}</strong>{' '}
                <span>
                  {item.status} · {new Date(item.occurredAt).toLocaleString('tr-TR')}
                </span>
              </div>
            ))}
          </div>
        )}
        <form className="preview-row" onSubmit={reply}>
          <TextField name="content" label="Yanıt" required />
          <Button type="submit">
            <Send /> Gönder
          </Button>
        </form>
      </section>
    </main>
  );
}
