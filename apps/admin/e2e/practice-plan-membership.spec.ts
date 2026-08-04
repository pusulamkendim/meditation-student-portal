import { expect, test } from '@playwright/test';

const corsHeaders = {
  'access-control-allow-origin': 'http://localhost:3001',
  'access-control-allow-credentials': 'true',
  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'access-control-allow-headers': 'content-type,x-csrf-token,x-session-refresh',
};

const studentId = '10000000-0000-4000-8000-000000000001';
const subscriptionId = '20000000-0000-4000-8000-000000000001';

test('updates membership end date and publishes an independent weekday plan', async ({
  page,
}, testInfo) => {
  let subscriptionPayload: Record<string, unknown> | undefined;
  let planPayload: Record<string, unknown> | undefined;
  const detail = {
    id: studentId,
    fullName: 'Ayşe Yılmaz',
    status: 'ACTIVE',
    registrationStep: 'ACTIVE',
    timezone: 'Europe/Istanbul',
    preferredLocale: 'tr-TR',
    curriculumStage: 'INTRODUCTION',
    curriculumStageSource: 'DEFAULT',
    journey: {
      key: 'WEEK_2',
      label: '2. hafta',
      completedMeetingCount: 1,
      source: 'MEETING',
    },
    version: 2,
    createdAt: '2026-07-10T09:00:00.000Z',
    subscriptions: [
      {
        id: subscriptionId,
        status: 'ACTIVE',
        startDate: '2026-07-10T00:00:00.000Z',
        endExclusive: '2026-08-15T00:00:00.000Z',
        priceMinor: '400000',
        currency: 'TRY',
        credits: 3,
        version: 4,
      },
    ],
    channels: [],
    consents: [],
    payments: [],
    practicePlan: {
      id: '30000000-0000-4000-8000-000000000001',
      subscriptionId,
      status: 'ACTIVE',
      revision: 2,
      effectiveFrom: '2026-07-10T09:00:00.000Z',
      activeWeekdays: [1, 2, 3, 4, 5, 6, 7],
      slots: [
        {
          id: '40000000-0000-4000-8000-000000000001',
          slotKey: 'MORNING',
          localTime: '08:00',
          durationMinutes: 15,
          active: true,
        },
        {
          id: '40000000-0000-4000-8000-000000000002',
          slotKey: 'EVENING',
          localTime: '21:00',
          durationMinutes: 15,
          active: true,
        },
      ],
    },
    practice: {
      completed: 4,
      missed: 1,
      skipped: 0,
      pending: 12,
      cancelled: 0,
      complianceRate: 80,
      sessions: [],
    },
    meetings: [],
    completedMeetingCount: 1,
    openHandoffCount: 0,
    noteCount: 0,
  };

  await page.route('**/v1/admin/auth/refresh', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders,
      body: '{"csrfToken":"practice-e2e-csrf"}',
    }),
  );
  await page.route('**/v1/admin/meditations', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders,
      body: '[]',
    }),
  );
  await page.route(`**/v1/admin/students/${studentId}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify(detail),
    }),
  );
  await page.route(`**/v1/admin/subscriptions/${subscriptionId}/end-date`, async (route) => {
    subscriptionPayload = route.request().postDataJSON() as Record<string, unknown>;
    detail.subscriptions[0].endExclusive = `${subscriptionPayload.endExclusive}T00:00:00.000Z`;
    detail.subscriptions[0].version += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify(detail.subscriptions[0]),
    });
  });
  await page.route(`**/v1/admin/students/${studentId}/practice-plan/versions`, async (route) => {
    planPayload = route.request().postDataJSON() as Record<string, unknown>;
    const submitted = planPayload as {
      activeWeekdays: number[];
      slots: Array<{
        slotKey: string;
        localTime: string;
        active: boolean;
        durationMinutes: number;
      }>;
    };
    detail.practicePlan.activeWeekdays = submitted.activeWeekdays;
    detail.practicePlan.revision = 3;
    detail.practicePlan.slots = detail.practicePlan.slots.map((slot) => ({
      ...slot,
      ...submitted.slots.find((submittedSlot) => submittedSlot.slotKey === slot.slotKey),
    }));
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify(detail.practicePlan),
    });
  });

  await page.goto(`/students/${studentId}`);
  await expect(page.getByRole('heading', { name: 'Ayşe Yılmaz' })).toBeVisible();

  await page.getByRole('button', { name: 'Bitiş tarihini değiştir' }).click();
  const subscriptionDialog = page.getByRole('dialog', {
    name: 'Üyelik bitiş tarihini değiştir',
  });
  await subscriptionDialog.getByLabel('Üyelik bitiş tarihi').fill('2026-08-22');
  await subscriptionDialog.getByLabel('Değişiklik nedeni').fill('Öğrenci talebi');
  await subscriptionDialog.getByRole('button', { name: 'Tarihi güncelle' }).click();
  await expect
    .poll(() => subscriptionPayload)
    .toMatchObject({
      endExclusive: '2026-08-22',
      expectedVersion: 4,
      reason: 'Öğrenci talebi',
    });
  await expect(page.getByText('22 Ağu 2026')).toBeVisible();

  await page.getByRole('tab', { name: /Pratikler/ }).click();
  await page.getByRole('button', { name: 'Planı düzenle' }).click();
  await page.getByLabel('Sabah süresi').fill('15');
  await page.getByLabel('Akşam süresi').fill('25');
  await page.getByRole('button', { name: 'Hafta içi' }).click();
  await page.getByLabel('Sal').uncheck();
  await page.getByLabel('Per').uncheck();
  await page.getByRole('button', { name: 'Değişiklikleri yayınla' }).click();

  await expect
    .poll(() => planPayload)
    .toMatchObject({
      subscriptionId,
      activeWeekdays: [1, 3, 5],
      slots: [
        expect.objectContaining({ slotKey: 'MORNING', durationMinutes: 15 }),
        expect.objectContaining({ slotKey: 'EVENING', durationMinutes: 25 }),
      ],
    });
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  await page.screenshot({
    path: testInfo.outputPath('student-practice-plan-and-membership.png'),
    fullPage: true,
  });
});
