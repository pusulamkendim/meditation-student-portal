import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import {
  drawingTitleFromFilename,
  parseExcalidrawBuffer,
  parseExcalidrawScene,
} from './drawing.service.js';

const validScene = {
  type: 'excalidraw',
  version: 2,
  source: 'https://excalidraw.com',
  elements: [{ id: 'rectangle-1', type: 'rectangle', x: 10, y: 20 }],
  appState: { viewBackgroundColor: '#ffffff' },
  files: {},
};

describe('Excalidraw drawing validation', () => {
  it('accepts the open Excalidraw JSON format without discarding scene data', () => {
    const scene = parseExcalidrawScene(validScene);

    expect(scene.type).toBe('excalidraw');
    expect(scene.elements).toHaveLength(1);
    expect(scene.elements[0]).toMatchObject({ id: 'rectangle-1', type: 'rectangle' });
    expect(scene.appState).toMatchObject({ viewBackgroundColor: '#ffffff' });
  });

  it('reads a valid .excalidraw buffer', () => {
    const scene = parseExcalidrawBuffer(Buffer.from(JSON.stringify(validScene)));

    expect(scene.source).toBe('https://excalidraw.com');
  });

  it.each([
    ['invalid JSON', Buffer.from('{broken')],
    ['wrong document type', Buffer.from(JSON.stringify({ ...validScene, type: 'other' }))],
    ['missing elements', Buffer.from(JSON.stringify({ type: 'excalidraw', version: 2 }))],
  ])('rejects %s', (_caseName, buffer) => {
    expect(() => parseExcalidrawBuffer(buffer)).toThrow(BadRequestException);
  });

  it('rejects oversized files before parsing them', () => {
    expect(() => parseExcalidrawBuffer(Buffer.alloc(25 * 1024 * 1024 + 1))).toThrow(
      '25 MiB sınırını aşıyor',
    );
  });

  it('derives a readable title from the uploaded filename', () => {
    expect(drawingTitleFromFilename('Nefes Döngüsü.excalidraw')).toBe('Nefes Döngüsü');
    expect(drawingTitleFromFilename('.excalidraw')).toBe('Adsız çizim');
  });
});
