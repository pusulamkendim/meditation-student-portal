import { expect, test } from '@playwright/test';

const dashboard = {
  generatedAt: '2026-08-05T12:00:00.000Z',
  counts: {
    activeStudents: 4,
    paymentReviews: 1,
    recentMessages: 3,
    failedMessages: 1,
    openHandoffs: 1,
    todayMeetings: 1,
  },
  practice: {
    completed: 12,
    skipped: 2,
    missed: 4,
    completionRate: 66.7,
    responseRate: 77.8,
    reflectionRate: 75,
    trend: 8.4,
    daily: [
      { date: '2026-07-30', completed: 1, skipped: 0, missed: 1 },
      { date: '2026-07-31', completed: 2, skipped: 0, missed: 0 },
      { date: '2026-08-01', completed: 1, skipped: 1, missed: 1 },
      { date: '2026-08-02', completed: 2, skipped: 0, missed: 1 },
      { date: '2026-08-03', completed: 1, skipped: 0, missed: 0 },
      { date: '2026-08-04', completed: 3, skipped: 1, missed: 1 },
      { date: '2026-08-05', completed: 2, skipped: 0, missed: 0 },
    ],
    slots: [
      { slotKey: 'MORNING', completed: 10, total: 13, completionRate: 76.9 },
      { slotKey: 'EVENING', completed: 2, total: 5, completionRate: 40 },
    ],
  },
  studentPulse: [
    {
      id: 'student-1',
      fullName: 'Seden Kıras',
      channel: 'TELEGRAM',
      lastInboundAt: '2026-08-05T10:20:00.000Z',
      completed: 3,
      skipped: 1,
      missed: 3,
      reflections: 2,
      completionRate: 42.9,
      trend: -7.1,
      openHandoffs: 0,
      schedule: [
        { slotKey: 'MORNING', localTime: '09:15', durationMinutes: 20 },
        { slotKey: 'EVENING', localTime: '21:30', durationMinutes: 20 },
      ],
      recommendation: 'Son 7 günlük yanıtlara göre programı tek seansa indirmeyi değerlendirin.',
    },
    {
      id: 'student-2',
      fullName: 'Duygu Bulut',
      channel: 'TELEGRAM',
      lastInboundAt: '2026-08-04T13:02:00.000Z',
      completed: 5,
      skipped: 1,
      missed: 0,
      reflections: 5,
      completionRate: 83.3,
      trend: 12,
      openHandoffs: 1,
      schedule: [{ slotKey: 'MORNING', localTime: '10:00', durationMinutes: 20 }],
    },
  ],
  recentMessages: [
    {
      id: 'message-1',
      studentId: 'student-1',
      fullName: 'Seden Kıras',
      channel: 'TELEGRAM',
      content: 'Bu sabah pratik gayet iyi geçti, düşünceleri fark edip tekrar ana döndüm.',
      source: 'GENERAL',
      occurredAt: '2026-08-05T10:22:00.000Z',
    },
    {
      id: 'message-2',
      fullName: undefined,
      channel: 'WHATSAPP',
      content:
        'Beden Taraması meditasyonunu tamamladım. Birebir meditasyon hakkında bilgi almak istiyorum.',
      source: 'MEDITATION',
      occurredAt: '2026-08-05T09:00:00.000Z',
    },
  ],
  failedMessages: [
    {
      id: 'failed-1',
      studentId: 'student-2',
      fullName: 'Duygu Bulut',
      channel: 'WHATSAPP',
      category: 'PRACTICE_REMINDER',
      status: 'FAILED',
      preview: 'Merhaba Duygu, saat 10:00 pratiğine 10 dakika kaldı.',
      updatedAt: '2026-08-05T06:50:00.000Z',
    },
  ],
  handoffs: [
    {
      id: 'handoff-1',
      studentId: 'student-2',
      fullName: 'Duygu Bulut',
      reason: 'Öğrenci kişisel destek isteyen bir mesaj gönderdi.',
      createdAt: '2026-08-05T09:10:00.000Z',
    },
  ],
  meetings: [
    {
      id: 'meeting-1',
      studentId: 'student-1',
      fullName: 'Seden Kıras',
      startsAt: '2026-08-05T15:00:00.000Z',
      endsAt: '2026-08-05T16:00:00.000Z',
      status: 'SCHEDULED',
    },
  ],
  content: {
    assignments: { ASSIGNED: 2, OPENED: 2, COMPLETED: 1 },
    readings: { visitors: 35, views: 51, pdfDownloads: 4, whatsappClicks: 6 },
    meditations: { visitors: 28, views: 42, starts: 31, completions: 18, ctaClicks: 5 },
  },
};

test.beforeEach(async ({ page }) => {
  await page.route('**/v1/admin/auth/refresh', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: '{"csrfToken":"dashboard-e2e-csrf"}',
    }),
  );
  await page.route('**/v1/admin/dashboard', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(dashboard),
    }),
  );
});

test('shows daily actions, student pulse and content metrics without horizontal overflow', async ({
  page,
}, testInfo) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Genel Bakış' })).toBeVisible();
  await expect(page.getByText('Son öğrenci mesajları')).toBeVisible();
  await expect(page.getByText('Sadeleştirme önerisi')).toBeVisible();
  await expect(
    page.getByText('Merhaba Duygu, saat 10:00 pratiğine 10 dakika kaldı.'),
  ).toBeVisible();
  await expect(page.getByText('Global meditasyon')).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  await page.screenshot({ path: testInfo.outputPath('dashboard.png'), fullPage: true });
});
