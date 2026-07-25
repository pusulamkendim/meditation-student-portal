'use client';

import { Excalidraw, serializeAsJSON } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  ExcalidrawProps,
} from '@excalidraw/excalidraw/types';
import { useEffect, useMemo, useState } from 'react';

export type DrawingScene = {
  type: 'excalidraw';
  version: number;
  source?: string;
  elements: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
  [key: string]: unknown;
};

export type DrawingEditorProps = {
  drawingId: string;
  scene: DrawingScene;
  onChange: (scene: DrawingScene) => void;
};

export default function DrawingEditor({ drawingId, scene, onChange }: DrawingEditorProps) {
  const [editorApi, setEditorApi] = useState<ExcalidrawImperativeAPI | null>(null);
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
    if (!editorApi || scene.elements.length === 0) return;
    const timeout = window.setTimeout(() => {
      editorApi.scrollToContent(editorApi.getSceneElements(), {
        fitToViewport: true,
        viewportZoomFactor: 0.82,
        maxZoom: 1,
      });
    }, 100);
    return () => window.clearTimeout(timeout);
  }, [drawingId, editorApi, scene.elements.length]);
  const handleChange: NonNullable<ExcalidrawProps['onChange']> = (elements, appState, files) => {
    onChange(JSON.parse(serializeAsJSON(elements, appState, files, 'local')) as DrawingScene);
  };

  return (
    <div className="drawing-canvas" data-drawing-id={drawingId}>
      <Excalidraw
        excalidrawAPI={setEditorApi}
        initialData={initialData}
        langCode="tr-TR"
        name="Meditasyon çizimi"
        onChange={handleChange}
      />
    </div>
  );
}
