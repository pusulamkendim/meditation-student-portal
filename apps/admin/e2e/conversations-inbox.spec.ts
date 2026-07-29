import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/v1/admin/auth/refresh', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: '{"csrfToken":"conversation-e2e-csrf"}',
    }),
  );
  await page.route('**/v1/admin/conversations/inbox', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            id: 'inbox-reading',
            channel: 'WHATSAPP',
            contact: '905551112233',
            content:
              'Merhaba Necip, “Aydınlanma Gecesi” okumasının “Orta Yol” bölümünü okudum. Birebir meditasyon dersleri hakkında bilgi almak istiyorum.',
            occurredAt: '2026-07-29T12:30:00.000Z',
            inboundCount: 1,
            readingInquiry: true,
          },
          {
            id: 'inbox-student',
            studentId: 'student-1',
            fullName: 'Ayşe Yılmaz',
            channel: 'TELEGRAM',
            contact: '123456789',
            content: 'Bugünkü pratik saatimi öğrenebilir miyim?',
            occurredAt: '2026-07-29T12:00:00.000Z',
            inboundCount: 4,
            readingInquiry: false,
          },
        ],
      }),
    }),
  );
  await page.route('**/v1/admin/conversations', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            id: 'student-1',
            fullName: 'Ayşe Yılmaz',
            status: 'ACTIVE',
            messages: [
              {
                occurredAt: '2026-07-29T12:00:00.000Z',
                direction: 'INBOUND',
                status: 'RECEIVED',
              },
            ],
            messageIntents: [],
            channel: { type: 'TELEGRAM', status: 'ACTIVE' },
          },
        ],
      }),
    }),
  );
});

test('shows reading inquiries and unregistered inbound contacts in the inbox', async ({ page }) => {
  await page.goto('/conversations');

  await expect(page.getByRole('tab', { name: /Gelen kutusu/u })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByText('Kayıtlı değil · 905551112233')).toBeVisible();
  await expect(page.getByText('Okuma ilgisi')).toBeVisible();
  await expect(page.getByText('Ayşe Yılmaz')).toBeVisible();

  await page.getByRole('button', { name: 'Okumadan gelenler' }).click();
  await expect(page.getByText('Kayıtlı değil · 905551112233')).toBeVisible();
  await expect(page.getByText('Ayşe Yılmaz')).toBeHidden();

  const whatsappLink = page.locator('.conversation-inbox-list > a');
  await expect(whatsappLink).toHaveAttribute('href', 'https://wa.me/905551112233');
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});
