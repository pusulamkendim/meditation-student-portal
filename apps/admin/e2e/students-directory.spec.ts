import { expect, test } from '@playwright/test';

const students = [
  {
    id: 'student-ayse',
    fullName: 'Ayşe Yılmaz',
    status: 'ACTIVE',
    registrationStep: 'ACTIVE',
    timezone: 'Europe/Istanbul',
    createdAt: '2026-08-01T09:00:00.000Z',
    journey: { key: 'WEEK_2', label: '2. Hafta', completedMeetingCount: 2, source: 'MEETING' },
    channel: {
      type: 'WHATSAPP',
      displayName: 'Ayşe',
      identifier: '905551112233',
      status: 'ACTIVE',
    },
    subscription: {
      status: 'ACTIVE',
      startDate: '2026-08-01T00:00:00.000Z',
      endExclusive: '2026-09-01T00:00:00.000Z',
      priceMinor: '400000',
      currency: 'TRY',
      credits: 4,
    },
    practice: { completed: 9, missed: 2, skipped: 1, pending: 1, complianceRate: 75 },
    nextMeetingAt: '2026-08-12T15:00:00.000Z',
  },
  {
    id: 'student-mert',
    fullName: 'Mert Aydın',
    status: 'PAYMENT_PENDING',
    registrationStep: 'PAYMENT',
    timezone: 'Europe/Istanbul',
    createdAt: '2026-08-07T09:00:00.000Z',
    journey: { key: 'WEEK_0', label: '0. Hafta', completedMeetingCount: 0, source: 'SUBSCRIPTION' },
    channel: { type: 'TELEGRAM', displayName: 'Mert', identifier: '123456789', status: 'ACTIVE' },
    practice: { completed: 0, missed: 0, skipped: 0, pending: 0, complianceRate: 0 },
  },
];

test.beforeEach(async ({ page }) => {
  await page.route('**/v1/admin/auth/refresh', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: '{"csrfToken":"students-e2e-csrf"}',
    }),
  );
  await page.route('**/v1/admin/students', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: students }),
    }),
  );
});

test('shows students as an open line-separated operational list', async ({ page }) => {
  await page.goto('/students');

  const list = page.locator('.student-directory-list');
  await expect(list).toBeVisible();
  await expect(page.locator('.student-table--professional')).toHaveCount(0);
  await expect(page.locator('.student-directory-row')).toHaveCount(2);
  await expect(page.getByText('Ayşe Yılmaz')).toBeVisible();
  await expect(page.getByText('%75')).toBeVisible();
  await expect(page.locator('.student-directory-row').first().getByText('2. Hafta')).toBeVisible();
  await expect(
    page.locator('.student-directory-row').nth(1).getByText('Ödeme bekliyor'),
  ).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});
