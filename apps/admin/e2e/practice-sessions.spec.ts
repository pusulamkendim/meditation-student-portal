import { expect, test } from '@playwright/test';

const now = Date.now();
const completedSession = {
  id: 'practice-completed',
  studentId: 'student-ayse',
  studentName: 'Ayşe Yılmaz',
  status: 'COMPLETED',
  version: 3,
  startAt: new Date(now - 60 * 60 * 1000).toISOString(),
  durationMinutes: 20,
  slot: 'MORNING',
  localTime: '08:00',
  planRevision: 2,
  reflection: {
    content: 'Nefesime döndükçe omuzlarımın gevşediğini fark ettim.',
    createdAt: new Date(now - 30 * 60 * 1000).toISOString(),
    tags: [{ tag: 'beden farkındalığı', confidence: 0.91 }],
  },
};

const sessions = [
  completedSession,
  {
    ...completedSession,
    id: 'practice-missed',
    status: 'MISSED',
    version: 1,
    startAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
    durationMinutes: 15,
    reflection: undefined,
  },
  {
    ...completedSession,
    id: 'practice-planned',
    status: 'SCHEDULED',
    version: 1,
    startAt: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
    reflection: undefined,
  },
];

test.beforeEach(async ({ page }) => {
  await page.route('**/v1/admin/auth/refresh', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: '{"csrfToken":"practice-e2e-csrf"}',
    }),
  );
  await page.route('**/v1/admin/practice-sessions', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: sessions }),
    }),
  );
  await page.route('**/v1/admin/students', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [{ id: 'student-ayse', fullName: 'Ayşe Yılmaz', status: 'ACTIVE' }],
      }),
    }),
  );
});

test('shows weekly outcomes and lets the admin edit a session reflection', async ({ page }) => {
  let outcomePayload: Record<string, unknown> | undefined;
  await page.route('**/v1/admin/practice-sessions/practice-completed/outcome', async (route) => {
    outcomePayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ updated: true }),
    });
  });

  await page.goto('/practice');

  const overview = page.locator('.practice-overview');
  await expect(overview.getByText('Bu hafta tamamlandı')).toBeVisible();
  await expect(overview.getByText('Meditasyon süresi')).toBeVisible();
  await expect(overview.getByText('20 dk')).toBeVisible();
  await expect(overview.getByText('Planlanan')).toHaveCount(0);

  await page
    .getByRole('button', { name: /Ayşe Yılmaz/u })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'Ayşe Yılmaz' })).toBeVisible();
  await expect(
    page.getByText('Nefesime döndükçe omuzlarımın gevşediğini fark ettim.'),
  ).toBeVisible();
  await expect(page.getByText('beden farkındalığı')).toBeVisible();

  await page.getByRole('button', { name: 'Durumu ve refleksiyonu düzenle' }).click();
  const reflection = page.getByLabel('Refleksiyon');
  await expect(reflection).toHaveValue('Nefesime döndükçe omuzlarımın gevşediğini fark ettim.');
  await reflection.fill('Pratik boyunca nefes ve omuzlardaki gevşemeyi takip ettim.');
  await page.getByLabel('İşlem nedeni').fill('Görüşme notuna göre refleksiyon düzeltildi.');
  await page.getByRole('button', { name: 'Kaydet' }).click();

  await expect
    .poll(() => outcomePayload)
    .toEqual({
      status: 'COMPLETED',
      expectedVersion: 3,
      reflection: 'Pratik boyunca nefes ve omuzlardaki gevşemeyi takip ettim.',
      reason: 'Görüşme notuna göre refleksiyon düzeltildi.',
    });

  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});
