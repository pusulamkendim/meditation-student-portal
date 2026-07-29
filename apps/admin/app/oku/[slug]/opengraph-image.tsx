import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Meditasyon okuması';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export default async function OpenGraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const response = await fetch(`${api}/v1/readings/public/${encodeURIComponent(slug)}/meta`).catch(
    () => undefined,
  );
  const meta = response?.ok
    ? ((await response.json()) as {
        title: string;
        description?: string | null;
        author?: string | null;
        estimatedMinutes: number;
      })
    : undefined;

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '76px 84px',
        background: '#f2f7f4',
        color: '#17221e',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 28 }}>
        <div
          style={{
            width: 54,
            height: 54,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 12,
            background: '#376c5a',
            color: '#fff',
          }}
        >
          M
        </div>
        <span>Meditasyon · Okuma alanı</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ fontSize: 66, lineHeight: 1.08, fontWeight: 700 }}>
          {meta?.title ?? 'Meditasyon okuması'}
        </div>
        {meta?.description ? (
          <div style={{ maxWidth: 920, fontSize: 28, lineHeight: 1.4, color: '#56645f' }}>
            {meta.description.slice(0, 180)}
          </div>
        ) : null}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 24,
          color: '#60716a',
        }}
      >
        <span>{meta?.author ?? 'Necip Sülbü'}</span>
        <span>{meta ? `${meta.estimatedMinutes} dakika` : 'Kısa okuma'}</span>
      </div>
    </div>,
    size,
  );
}
