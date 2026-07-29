'use client';

import { Expand, LoaderCircle, Network } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

const DrawingViewer = dynamic(() => import('./drawing-viewer'), {
  ssr: false,
  loading: () => (
    <div className="public-drawing-loading">
      <LoaderCircle className="spin" aria-hidden="true" />
      <span>Çizim hazırlanıyor...</span>
    </div>
  ),
});

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

type DrawingAccess = {
  title: string;
  description?: string | null;
  scene: {
    elements: unknown[];
    appState?: Record<string, unknown>;
    files?: Record<string, unknown>;
  };
  sharedVersion: number;
  currentVersion: number;
  updatedSinceShare: boolean;
};

async function accessDrawing(token: string): Promise<DrawingAccess> {
  const response = await fetch(`${api}/v1/drawings/access`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      (payload as { message?: string }).message ?? 'Çizim bağlantısı geçersiz veya süresi dolmuş.',
    );
  return payload as DrawingAccess;
}

export default function PublicDrawingPage() {
  const [drawing, setDrawing] = useState<DrawingAccess>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    const token = window.location.hash.slice(1);
    if (!token) {
      setError('Çizim bağlantısı eksik veya geçersiz.');
      return;
    }
    void accessDrawing(token)
      .then(setDrawing)
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Çizim açılamadı.'));
  }, []);

  if (error)
    return (
      <main className="public-drawing-state">
        <Network aria-hidden="true" />
        <h1>Çizim açılamadı</h1>
        <p>{error}</p>
      </main>
    );

  if (!drawing)
    return (
      <main className="public-drawing-state">
        <LoaderCircle className="spin" aria-hidden="true" />
        <p>Çizim hazırlanıyor...</p>
      </main>
    );

  return (
    <main
      className="public-drawing"
      data-updated-since-share={drawing.updatedSinceShare || undefined}
    >
      <header>
        <span>
          <Network aria-hidden="true" />
        </span>
        <div>
          <strong>{drawing.title}</strong>
          <small>
            {drawing.description ??
              'Yakınlaştırmak ve ekranda hareket etmek için dokunabilir veya sürükleyebilirsin.'}
          </small>
        </div>
        <Expand aria-label="Salt okunur çizim" />
      </header>
      {drawing.updatedSinceShare ? (
        <div className="public-drawing-update">Bu çizimin güncel sürümünü görüntülüyorsun.</div>
      ) : null}
      <section className="public-drawing-canvas">
        <DrawingViewer scene={drawing.scene} />
      </section>
    </main>
  );
}
