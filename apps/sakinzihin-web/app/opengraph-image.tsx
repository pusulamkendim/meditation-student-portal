import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Sakin Zihin';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '70px 82px',
        color: '#f8f3ea',
        background: 'linear-gradient(135deg, #18352d 0%, #0d241e 100%)',
        fontFamily: 'Georgia',
      }}
    >
      <div style={{ display: 'flex', fontSize: 28, letterSpacing: 2 }}>SAKİN ZİHİN</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 850 }}>
        <div style={{ display: 'flex', color: '#d7ac5a', fontSize: 22 }}>
          MEDITASYON · FARKINDALIK · İÇGÖRÜ
        </div>
        <div style={{ display: 'flex', fontSize: 66, lineHeight: 1.08 }}>
          Meditasyon yapmayı öğren. Zihnini daha yakından tanı.
        </div>
      </div>
      <div style={{ display: 'flex', color: '#cbbfac', fontSize: 23 }}>sakinzihin.com</div>
    </div>,
    { ...size },
  );
}
