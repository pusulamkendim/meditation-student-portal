import { ImageResponse } from 'next/og';
import { createElement } from 'react';

export const runtime = 'edge';
export const alt = 'Sakin Zihin meditasyon ve farkındalık kütüphanesi';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        overflow: 'hidden',
        background: '#071717',
        color: '#f3eadb',
      }}
    >
      {createElement('img', {
        alt: '',
        src: 'https://portal.pusulamkendim.com/meditation/buddha-temple.png',
        style: {
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center 46%',
          opacity: 0.38,
        },
      })}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          background:
            'linear-gradient(90deg, rgba(2,15,15,.96) 0%, rgba(2,15,15,.78) 52%, rgba(2,15,15,.46) 100%)',
        }}
      />
      <div
        style={{
          position: 'relative',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '62px 72px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 22 }}>
          <span
            style={{
              width: 34,
              height: 34,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid #d6a25e',
              borderRadius: 999,
              color: '#d6a25e',
              fontSize: 17,
            }}
          >
            S
          </span>
          <strong>SAKİN ZİHİN</strong>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <span style={{ color: '#d6a25e', fontSize: 20, fontWeight: 700 }}>
            KENDİ RİTMİNDE BAŞLA
          </span>
          <div style={{ maxWidth: 790, fontFamily: 'Georgia', fontSize: 70, lineHeight: 1.02 }}>
            Meditasyon ve farkındalık kütüphanesi
          </div>
          <div style={{ maxWidth: 700, color: '#cbbfac', fontSize: 25, lineHeight: 1.45 }}>
            Kısa pratikler ve derinleştirici okumalarla kendine alan aç.
          </div>
        </div>
        <div style={{ display: 'flex', color: '#cbbfac', fontSize: 18 }}>sakinzihin.com</div>
      </div>
    </div>,
    size,
  );
}
