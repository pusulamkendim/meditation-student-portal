import { expect, test } from '@playwright/test';

const corsHeaders = {
  'access-control-allow-origin': 'http://localhost:3001',
  'access-control-allow-credentials': 'true',
  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'access-control-allow-headers': 'content-type,x-csrf-token,x-session-refresh',
};

const meditation = {
  id: '10000000-0000-4000-8000-000000000001',
  title: 'Doğal Nefes Farkındalığı',
  description: 'Nefesi değiştirmeden gözlemlemeye yönelik temel pratik.',
  level: 'INTRODUCTION',
  status: 'DRAFT',
  guidanceMode: 'GUIDED',
  targetDurations: [15, 20, 25, 30],
  audioRevision: 2,
  version: 3,
  updatedAt: '2026-07-29T12:00:00.000Z',
  openingAudio: {
    id: '20000000-0000-4000-8000-000000000001',
    kind: 'OPENING',
    version: 1,
    filename: 'nefes-baslangic.m4a',
    byteSize: 320_000,
    durationSeconds: 42,
    createdAt: '2026-07-29T12:00:00.000Z',
  },
  closingAudio: null,
  audioAssets: [],
  renders: [
    {
      id: '30000000-0000-4000-8000-000000000001',
      sourceVersion: 2,
      durationMinutes: 15,
      status: 'READY',
      byteSize: 7_200_000,
      actualDurationSeconds: 900,
      attempts: 1,
      renderedAt: '2026-07-29T12:05:00.000Z',
    },
    {
      id: '30000000-0000-4000-8000-000000000002',
      sourceVersion: 2,
      durationMinutes: 20,
      status: 'PROCESSING',
      attempts: 1,
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.route('**/v1/admin/auth/refresh', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      headers: corsHeaders,
      body: '{"csrfToken":"meditation-e2e-csrf"}',
    }),
  );
  await page.route('**/v1/admin/meditations', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify([meditation]),
    }),
  );
  await page.route(`**/v1/admin/meditations/${meditation.id}`, (route) =>
    route.request().method() === 'DELETE'
      ? route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: corsHeaders,
          body: '{"mode":"DELETED","message":"Meditasyon kalıcı olarak silindi."}',
        })
      : route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: corsHeaders,
          body: JSON.stringify(meditation),
        }),
  );
});

test('manages source audio and generated durations without horizontal overflow', async ({
  page,
}) => {
  await page.goto('/meditations');

  await expect(page.getByRole('heading', { name: 'Meditasyon Kütüphanesi' })).toBeVisible();
  await expect(page.getByText('Doğal Nefes Farkındalığı').first()).toBeVisible();
  await expect(page.getByText('Başlangıç yönlendirmesi')).toBeVisible();
  await expect(page.getByText('15').last()).toBeVisible();
  await expect(page.getByText('Hazır', { exact: true })).toBeVisible();
  await expect(page.getByText('Hazırlanıyor', { exact: true })).toBeVisible();

  await page.getByPlaceholder('Özel süre').fill('12');
  await page.getByTitle('Özel süre ekle').click();
  await expect(page.getByText('12 dk')).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});

test('explains safe deletion and sends the optimistic version', async ({ page }) => {
  let deletePayload: unknown;
  await page.route(`**/v1/admin/meditations/${meditation.id}`, (route) => {
    if (route.request().method() !== 'DELETE')
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: corsHeaders,
        body: JSON.stringify(meditation),
      });
    deletePayload = route.request().postDataJSON();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders,
      body: '{"mode":"DELETED","message":"Meditasyon kalıcı olarak silindi."}',
    });
  });

  await page.goto('/meditations');
  await page.getByRole('button', { name: 'Sil' }).first().click();
  await expect(page.getByRole('heading', { name: 'Meditasyonu sil' })).toBeVisible();
  await page.getByRole('button', { name: 'Sil' }).last().click();
  await expect.poll(() => deletePayload).toEqual({ expectedVersion: 3 });
});

test('uses the same spaced footer layout in create and delete dialogs', async ({
  page,
}, testInfo) => {
  async function expectAlignedActions(dialogName: string, screenshotName: string) {
    const dialog = page.getByRole('dialog', { name: dialogName });
    const footer = dialog.locator('footer');
    const buttons = footer.getByRole('button');
    const [footerBox, firstButtonBox, lastButtonBox] = await Promise.all([
      footer.boundingBox(),
      buttons.first().boundingBox(),
      buttons.last().boundingBox(),
    ]);

    expect(footerBox).not.toBeNull();
    expect(firstButtonBox).not.toBeNull();
    expect(lastButtonBox).not.toBeNull();
    expect(
      (lastButtonBox?.x ?? 0) - ((firstButtonBox?.x ?? 0) + (firstButtonBox?.width ?? 0)),
    ).toBeGreaterThanOrEqual(12);
    expect(
      Math.abs(
        (lastButtonBox?.x ?? 0) +
          (lastButtonBox?.width ?? 0) -
          ((footerBox?.x ?? 0) + (footerBox?.width ?? 0) - 20),
      ),
    ).toBeLessThanOrEqual(1);
    await dialog.screenshot({ path: testInfo.outputPath(screenshotName) });
  }

  await page.goto('/meditations');
  await page.getByRole('button', { name: 'Yeni meditasyon' }).click();
  await expectAlignedActions('Yeni meditasyon türü', 'create-meditation-dialog.png');
  await page.getByRole('button', { name: 'Vazgeç' }).click();

  await page.getByRole('button', { name: 'Sil' }).first().click();
  await expectAlignedActions('Meditasyonu sil', 'delete-meditation-dialog.png');
});

test('manages the global meditation link in a separate dialog', async ({ page }, testInfo) => {
  const publishedMeditation = {
    ...meditation,
    status: 'PUBLISHED',
    publicShare: { id: '40000000-0000-4000-8000-000000000001' },
  };
  const publicShare = {
    id: '40000000-0000-4000-8000-000000000001',
    slug: 'dogal-nefes-farkindaligi',
    status: 'ACTIVE',
    effectiveStatus: 'ACTIVE',
    allowedDurations: [15, 20, 25, 30],
    defaultDurationMinutes: 15,
    allowDurationSelection: true,
    allowIndexing: false,
    expiresAt: null,
    version: 1,
    publicUrl: 'http://localhost:3001/meditasyon/dogal-nefes-farkindaligi',
    metrics: {
      totalViews: 12,
      uniqueVisitors: 8,
      starts: 6,
      completions: 4,
      completionRate: 67,
      completedMinutes: 60,
      ctaViews: 4,
      ctaClicks: 2,
      ctaClickRate: 50,
      durations: [],
    },
  };

  await page.route('**/v1/admin/meditations', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify([publishedMeditation]),
    }),
  );
  await page.route(`**/v1/admin/meditations/${meditation.id}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify(publishedMeditation),
    }),
  );
  await page.route(`**/v1/admin/meditations/${meditation.id}/public-share`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify(publicShare),
    }),
  );

  await page.goto('/meditations');
  await expect(page.getByRole('heading', { name: 'Herkese açık paylaşım' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Global paylaşım' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Herkese açık paylaşım' })).toBeVisible();
  await expect(dialog.getByText(publicShare.publicUrl)).toBeVisible();
  await expect(dialog.getByText('Erişime açık')).toBeVisible();
  await expect(dialog.getByText('Tekil ziyaretçi')).toBeVisible();
  await expect(dialog.getByText('8', { exact: true })).toBeVisible();
  await expect(dialog.getByText('WhatsApp tıklaması')).toBeVisible();
  await expect(dialog.getByText('2', { exact: true })).toBeVisible();
  const dimensions = await dialog.evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  await page.screenshot({
    path: testInfo.outputPath('global-meditation-share.png'),
    fullPage: true,
  });
});
