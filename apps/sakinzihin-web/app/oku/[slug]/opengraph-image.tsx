import { ImageResponse } from 'next/og';

import { getReadingMeta } from '../../../lib/api/client';

export const runtime = 'edge';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function ReadingOpenGraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const meta = await getReadingMeta(slug);
  const title = meta?.title ?? 'Sakin Zihin okumaları';

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '70px 82px',
        color: '#18352d',
        background: 'linear-gradient(135deg, #f6f1e8 0%, #e8dfd0 100%)',
        fontFamily: 'Georgia',
      }}
    >
      <div style={{ display: 'flex', fontSize: 28, letterSpacing: 2 }}>SAKİN ZİHİN · OKUMA</div>
      <div style={{ display: 'flex', fontSize: 62, lineHeight: 1.08, maxWidth: 980 }}>{title}</div>
      <div style={{ display: 'flex', color: '#8c6a2c', fontSize: 23 }}>sakinzihin.com/oku</div>
    </div>,
    { ...size },
  );
}
