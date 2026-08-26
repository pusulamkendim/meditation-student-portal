import { expect, test } from '@playwright/test';

const studentId = '10000000-0000-4000-8000-000000000001';
const oldIdentityId = '10000000-0000-4000-8000-000000000002';
const token = 'abcdefghijklmnopqrstuvwxyzABCDEF1234567890_-';

const detail = {
  id: studentId,
  fullName: 'Ayşe Yılmaz',
  status: 'ACTIVE',
  registrationStep: 'ACTIVE',
  timezone: 'Europe/Istanbul',
  preferredLocale: 'tr-TR',
  curriculumStage: 'INTRODUCTION',
  curriculumStageSource: 'DEFAULT',
  journey: { key: 'WEEK_2', label: '2. hafta', completedMeetingCount: 1, source: 'MEETING' },
  version: 2,
  createdAt: '2026-08-01T09:00:00.000Z',
  channel: {
    id: oldIdentityId,
    type: 'WHATSAPP',
    displayName: 'Ayşe',
    identifier: '905550000001',
    status: 'ACTIVE',
    isDefault: true,
  },
  channels: [
    {
      id: oldIdentityId,
      type: 'WHATSAPP',
      displayName: 'Ayşe',
      identifier: '905550000001',
      status: 'ACTIVE',
      isDefault: true,
    },
  ],
  subscriptions: [],
  consents: [],
  payments: [],
  practice: {
    completed: 0,
    missed: 0,
    skipped: 0,
    pending: 0,
    cancelled: 0,
    complianceRate: 0,
    sessions: [],
  },
  meetings: [],
  completedMeetingCount: 1,
  openHandoffCount: 0,
  noteCount: 0,
};

test.beforeEach(async ({ page }) => {
  await page.route('**/v1/admin/auth/refresh', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"csrfToken":"number-transfer-e2e-csrf"}',
    }),
  );
  await page.route('**/v1/admin/meditations', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.route(`**/v1/admin/students/${studentId}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(detail) }),
  );
  await page.route(
    `**/v1/admin/students/${studentId}/channel-links/status?channel=WHATSAPP`,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"status":"NONE"}',
      }),
  );
  await page.route(`**/v1/admin/students/${studentId}/channel-links`, async (route) => {
    expect(route.request().postDataJSON()).toEqual({ channel: 'WHATSAPP' });
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: '10000000-0000-4000-8000-000000000003',
        command: `NUMARA DEGISTIR ${token}`,
        expiresAt: '2026-08-24T09:15:00.000Z',
      }),
    });
  });
});

test('creates a 24-hour link that opens the agent WhatsApp conversation', async ({ page }) => {
  let createRequestCount = 0;
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      request.url().endsWith(`/v1/admin/students/${studentId}/channel-links`)
    ) {
      createRequestCount += 1;
    }
  });

  await page.goto(`/students/${studentId}`);
  await page.getByRole('tab', { name: 'Profil ve izinler' }).click();
  await page.getByRole('button', { name: 'WhatsApp numarasını değiştir' }).click();

  const dialog = page.getByRole('dialog', { name: 'WhatsApp numarasını değiştir' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Bağlantı 24 saat geçerlidir');
  expect(createRequestCount).toBe(0);
  await dialog.getByRole('button', { name: 'Bağlantı oluştur' }).click();
  expect(createRequestCount).toBe(1);
  await expect(dialog).toContainText(
    `https://wa.me/905428078429?text=NUMARA%20DEGISTIR%20${token}`,
  );
  await expect(dialog.getByRole('button', { name: "WhatsApp'ta aç" })).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});

test('reopening the dialog does not create or revoke a link', async ({ page }) => {
  let createRequestCount = 0;
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      request.url().endsWith(`/v1/admin/students/${studentId}/channel-links`)
    ) {
      createRequestCount += 1;
    }
  });

  await page.goto(`/students/${studentId}`);
  await page.getByRole('tab', { name: 'Profil ve izinler' }).click();
  await page.getByRole('button', { name: 'WhatsApp numarasını değiştir' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Kapat', exact: true }).click();
  await page.getByRole('button', { name: 'WhatsApp numarasını değiştir' }).click();

  expect(createRequestCount).toBe(0);
  await expect(page.getByRole('dialog')).toContainText('Bağlantı oluştur');
});
