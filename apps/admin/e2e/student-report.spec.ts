import { expect, test } from '@playwright/test';

const corsHeaders = {
  'access-control-allow-origin': 'http://localhost:3001',
  'access-control-allow-credentials': 'true',
  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'access-control-allow-headers': 'content-type,x-csrf-token,x-session-refresh',
};

const studentId = '10000000-0000-4000-8000-000000000001';
const reportId = '20000000-0000-4000-8000-000000000001';

const report = {
  id: reportId,
  studentId,
  type: 'WEEKLY',
  periodStart: '2026-07-31',
  periodEndExclusive: '2026-08-07',
  status: 'DRAFT',
  aiStatus: 'READY',
  version: 2,
  createdAt: '2026-08-07T08:00:00.000Z',
  updatedAt: '2026-08-07T08:01:00.000Z',
  share: null,
  snapshot: {
    period: { start: '2026-07-31', endExclusive: '2026-08-07', durationDays: 7 },
    practice: {
      current: {
        planned: 7,
        completed: 5,
        skipped: 1,
        missed: 1,
        awaitingResponse: 0,
        reflections: 4,
        completionRate: 71,
        reflectionRate: 80,
      },
      previous: { planned: 7, completed: 4, completionRate: 57 },
      completionRateChange: 14,
      maxCompletedDayStreak: 3,
      days: [
        { date: '2026-07-31', sessions: [{ id: 's1', slot: 'MORNING', status: 'COMPLETED' }] },
        { date: '2026-08-01', sessions: [{ id: 's2', slot: 'MORNING', status: 'COMPLETED' }] },
        { date: '2026-08-02', sessions: [{ id: 's3', slot: 'MORNING', status: 'COMPLETED' }] },
        { date: '2026-08-03', sessions: [{ id: 's4', slot: 'MORNING', status: 'SKIPPED' }] },
        { date: '2026-08-04', sessions: [{ id: 's5', slot: 'MORNING', status: 'COMPLETED' }] },
        { date: '2026-08-05', sessions: [{ id: 's6', slot: 'MORNING', status: 'MISSED' }] },
        { date: '2026-08-06', sessions: [{ id: 's7', slot: 'MORNING', status: 'COMPLETED' }] },
      ],
    },
    subscription: { packageWeek: 3 },
    meetings: [{ id: 'm1', startsAt: '2026-08-08T12:00:00.000Z', status: 'SCHEDULED' }],
  },
  content: {
    subtitle: 'Ritmini daha yakından tanıdığın bir hafta.',
    featuredReflectionId: '30000000-0000-4000-8000-000000000001',
    featuredReflectionQuote: 'Düşünceler geldiğinde nefese daha kolay geri dönebildim.',
    gentleObservation: {
      text: 'Sabah pratiklerinde kurduğun düzen bu hafta daha görünür hale geldi.',
      evidenceRefs: ['practice:summary'],
    },
    supportPoint: {
      text: 'Zorlandığın günlerde süreyi büyütmeden yalnızca başlamaya odaklanabilirsin.',
      evidenceRefs: ['practice:summary'],
    },
    weeklyEvaluation: {
      text: 'Tamamlama oranın önceki döneme göre yükseldi; refleksiyonlarında yeniden dönme becerisi öne çıkıyor.',
      evidenceRefs: ['practice:comparison'],
    },
    internal: { confidence: 0.86, insufficientEvidence: false, safetyConcern: false },
  },
  reflectionCandidates: [
    {
      id: '30000000-0000-4000-8000-000000000001',
      sessionId: 's1',
      date: '2026-07-31',
      slot: 'MORNING',
      meditationType: 'Anapanasati',
      text: 'Düşünceler geldiğinde nefese daha kolay geri dönebildim.',
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.route('**/v1/admin/auth/refresh', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders,
      body: '{"csrfToken":"report-e2e-csrf"}',
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
      body: JSON.stringify({
        id: studentId,
        fullName: 'Ayşe Yılmaz',
        status: 'ACTIVE',
        registrationStep: 'ACTIVE',
        timezone: 'Europe/Istanbul',
        preferredLocale: 'tr-TR',
        curriculumStage: 'INTRODUCTION',
        curriculumStageSource: 'DEFAULT',
        journey: { key: 'WEEK_3', label: '3. hafta', completedMeetingCount: 2, source: 'MEETING' },
        version: 2,
        createdAt: '2026-07-10T09:00:00.000Z',
        subscriptions: [],
        channels: [],
        consents: [],
        payments: [],
        practicePlan: null,
        practice: {
          completed: 5,
          missed: 1,
          skipped: 1,
          pending: 0,
          cancelled: 0,
          complianceRate: 71,
          sessions: [],
        },
        meetings: [],
        completedMeetingCount: 2,
        openHandoffCount: 0,
        noteCount: 0,
      }),
    }),
  );
  await page.route(`**/v1/admin/students/${studentId}/reports`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify({ items: [report] }),
    }),
  );
  await page.route(`**/v1/admin/student-reports/${reportId}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify(report),
    }),
  );
});

test('shows an editable evidence-based student report without horizontal overflow', async ({
  page,
}, testInfo) => {
  await page.goto(`/students/${studentId}`);
  await page.getByRole('tab', { name: /Karneler/ }).click();

  await expect(
    page.getByRole('heading', { name: 'Ayşe Yılmaz için haftalık karne' }),
  ).toBeVisible();
  await expect(page.getByText('Ritmini daha yakından tanıdığın bir hafta.')).toBeVisible();
  await expect(page.getByText('%71')).toBeVisible();
  await expect(
    page
      .locator('.student-report-preview blockquote')
      .getByText('Düşünceler geldiğinde nefese daha kolay geri dönebildim.'),
  ).toBeVisible();
  await expect(
    page.locator('.student-report-days i[data-status="COMPLETED"] svg').first(),
  ).toBeVisible();
  await expect(page.locator('.student-report-days i[data-status="MISSED"] svg')).toBeVisible();
  await expect(page.getByText('Haftalık birebir görüşme')).toHaveCount(0);

  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  await page.screenshot({ path: testInfo.outputPath('student-report.png'), fullPage: true });
});

test('queues an active report link for the student default channel', async ({ page }) => {
  const publishedReport = {
    ...report,
    status: 'PUBLISHED',
    share: {
      status: 'ACTIVE',
      viewCount: 0,
      sendCount: 0,
      publicUrl: 'https://sakinzihin.com/karne/public-test-token',
    },
  };
  await page.route(`**/v1/admin/students/${studentId}/reports`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify({ items: [publishedReport] }),
    }),
  );
  await page.route(`**/v1/admin/student-reports/${reportId}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify(publishedReport),
    }),
  );
  let sendRequested = false;
  await page.route(`**/v1/admin/student-reports/${reportId}/share/send`, async (route) => {
    sendRequested = true;
    expect(route.request().method()).toBe('POST');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: corsHeaders,
      body: JSON.stringify({ queued: true, channel: 'WHATSAPP' }),
    });
  });

  await page.goto(`/students/${studentId}`);
  await page.getByRole('tab', { name: /Karneler/ }).click();
  await page.getByRole('button', { name: 'Öğrenci ile paylaş' }).click();

  await expect(
    page.getByText('Karne bağlantısı WhatsApp gönderim kuyruğuna alındı.'),
  ).toBeVisible();
  expect(sendRequested).toBe(true);
});
