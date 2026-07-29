import { expect, test } from '@playwright/test';

const token = 'local-drawing-token-12345678901234567890';
const drawing = {
  title: 'Nefes Farkındalığı',
  description: 'Pratikte dikkatin bedende ve nefeste izlediği yol.',
  sharedVersion: 2,
  currentVersion: 2,
  updatedSinceShare: false,
  scene: {
    type: 'excalidraw',
    version: 2,
    elements: [
      {
        id: 'shape-1',
        type: 'rectangle',
        x: 120,
        y: 80,
        width: 420,
        height: 260,
        angle: 0,
        strokeColor: '#2f6f58',
        backgroundColor: '#dcefe7',
        fillStyle: 'solid',
        strokeWidth: 2,
        strokeStyle: 'solid',
        roughness: 1,
        opacity: 100,
        groupIds: [],
        frameId: null,
        index: 'a0',
        roundness: { type: 3 },
        seed: 1,
        version: 1,
        versionNonce: 1,
        isDeleted: false,
        boundElements: null,
        updated: 1,
        link: null,
        locked: false,
      },
    ],
    appState: { viewBackgroundColor: '#fffdf8' },
    files: {},
  },
};

test.beforeEach(async ({ page }) => {
  await page.route('**/v1/drawings/access', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify(drawing),
    }),
  );
});

test('renders a shared drawing in a read-only responsive canvas', async ({ page }) => {
  await page.goto(`/drawing#${token}`);
  await expect(page.getByText(drawing.title)).toBeVisible();
  await expect(page.getByText('Bu çizimin güncel sürümünü görüntülüyorsun.')).toHaveCount(0);
  await expect(page.locator('.public-drawing-canvas .excalidraw')).toBeVisible();
  await expect(page.locator('.public-drawing-canvas canvas').first()).toBeVisible();

  const layout = await page.evaluate(() => {
    const canvas = document.querySelector('.public-drawing-canvas');
    const editingTools = document.querySelectorAll(
      [
        'button[aria-label*="Rectangle" i]',
        'button[aria-label*="Dikdörtgen" i]',
        'button[aria-label*="Draw" i]',
        'button[aria-label*="Serbest çizim" i]',
      ].join(','),
    );
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      canvasWidth: canvas?.getBoundingClientRect().width ?? 0,
      canvasHeight: canvas?.getBoundingClientRect().height ?? 0,
      editingToolCount: editingTools.length,
    };
  });
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
  expect(layout.canvasWidth).toBeGreaterThan(280);
  expect(layout.canvasHeight).toBeGreaterThan(400);
  expect(layout.editingToolCount).toBe(0);
});

test('shares a drawing from the compact admin toolbar', async ({ page }) => {
  const summary = {
    id: 'drawing-1',
    title: drawing.title,
    description: drawing.description,
    byteSize: 2_400,
    elementCount: 1,
    status: 'PUBLISHED',
    version: 3,
    createdAt: '2026-07-29T12:00:00.000Z',
    updatedAt: '2026-07-29T13:00:00.000Z',
    createdByAdmin: { email: 'admin@example.com' },
    updatedByAdmin: { email: 'admin@example.com' },
    _count: { assignments: 0 },
  };
  const detail = {
    ...summary,
    storageKey: 'drawings/drawing-1/v3.excalidraw',
    contentHash: 'hash',
    scene: drawing.scene,
    assignments: [],
  };

  await page.route('**/v1/admin/auth/refresh', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: '{"csrfToken":"drawing-e2e-csrf"}',
    }),
  );
  await page.route('**/v1/admin/students', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            fullName: 'Duygu Yılmaz',
            status: 'ACTIVE',
            channel: { type: 'TELEGRAM' },
          },
        ],
      }),
    }),
  );
  await page.route('**/v1/admin/drawings/drawing-1/assignments', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            studentId: '11111111-1111-4111-8111-111111111111',
            assignmentId: 'assignment-1',
            drawingUrl: `http://localhost:3001/drawing#${token}`,
            sent: true,
          },
        ],
      }),
    }),
  );
  await page.route('**/v1/admin/drawings/drawing-1', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(detail) }),
  );
  await page.route('**/v1/admin/drawings', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([summary]),
    }),
  );

  await page.goto('/drawings');
  await expect(page.getByRole('textbox', { name: 'Çizim adı' })).toHaveValue(drawing.title);
  await page.getByRole('button', { name: 'Öğrenciyle paylaş' }).click();
  await expect(page.getByRole('heading', { name: 'Öğrenciyle paylaş' })).toBeVisible();
  await page.getByText('Duygu Yılmaz').click();
  await page.getByRole('button', { name: /1 öğrenciye gönder/u }).click();
  await expect(page.getByRole('heading', { name: 'Paylaşım sonuçları' })).toBeVisible();
  await expect(page.getByText('Mesaj kuyruğa alındı')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Kopyala' })).toBeVisible();
});
