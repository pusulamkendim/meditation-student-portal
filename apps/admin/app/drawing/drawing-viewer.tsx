'use client';

import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from '@excalidraw/excalidraw/types';
import { useEffect, useMemo, useState } from 'react';

type DrawingScene = {
  elements: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
};

export default function DrawingViewer({ scene }: { scene: DrawingScene }) {
  const [viewerApi, setViewerApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const initialData = useMemo(
    () =>
      ({
        elements: scene.elements,
        appState: scene.appState ?? {},
        files: scene.files ?? {},
      }) as ExcalidrawInitialDataState,
    [scene],
  );

  useEffect(() => {
    if (!viewerApi || scene.elements.length === 0) return;
    const timeout = window.setTimeout(() => {
      viewerApi.scrollToContent(viewerApi.getSceneElements(), {
        fitToViewport: true,
        viewportZoomFactor: 0.88,
        maxZoom: 1.4,
      });
    }, 120);
    return () => window.clearTimeout(timeout);
  }, [scene.elements.length, viewerApi]);

  return (
    <Excalidraw
      excalidrawAPI={setViewerApi}
      initialData={initialData}
      langCode="tr-TR"
      name="Paylaşılan meditasyon çizimi"
      viewModeEnabled
      zenModeEnabled
    />
  );
}
