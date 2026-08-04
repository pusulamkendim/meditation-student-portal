import { expect, test } from '@playwright/test';

const token = 'local-reading-token-12345678901234567890';

const reading = {
  title: 'Buddha’nın Aydınlanma Gecesi',
  description: 'Aydınlanma gecesini Siddhattha’nın zihninden izleyen kısa bir okuma.',
  author: 'Necip Sülbü',
  estimatedMinutes: 28,
  hasPdf: true,
  studentFirstName: 'Ayşe',
  sections: Array.from({ length: 5 }, (_, index) => ({
    position: index + 1,
    title: `${index + 1}. Bölüm`,
    contentMarkdown: `Bu bölümün okuma metni. ${'Nefesi ve deneyimi gözlemleme. '.repeat(80)}`,
    wordCount: 320,
  })),
  progress: {
    status: 'ASSIGNED',
    lastSectionPosition: 1,
    progressPercent: 0,
  },
};
const publicSlug = 'aydinlanma-gecesi';

test.beforeEach(async ({ page }) => {
  await page.route('**/v1/readings/access', (route) =>
    route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(reading) }),
  );
  await page.route('**/v1/readings/progress', (route) =>
    route.fulfill({ status: 201, contentType: 'application/json', body: '{"saved":true}' }),
  );
  await page.route('**/v1/readings/complete', (route) =>
    route.fulfill({ status: 201, contentType: 'application/json', body: '{"completed":true}' }),
  );
});

test('opens and completes an anonymous social reading with attribution', async ({
  page,
}, testInfo) => {
  let accessPayload: Record<string, unknown> | undefined;
  await page.route(`**/v1/readings/public/${publicSlug}/access`, async (route) => {
    accessPayload = (await route.request().postDataJSON()) as Record<string, unknown>;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        ...reading,
        studentFirstName: undefined,
        progress: { lastSectionPosition: 1, progressPercent: 0, completed: false },
      }),
    });
  });
  await page.route(`**/v1/readings/public/${publicSlug}/progress`, (route) =>
    route.fulfill({ status: 201, contentType: 'application/json', body: '{"saved":true}' }),
  );
  await page.route(`**/v1/readings/public/${publicSlug}/heartbeat`, (route) =>
    route.fulfill({ status: 201, contentType: 'application/json', body: '{"saved":true}' }),
  );
  await page.route(`**/v1/readings/public/${publicSlug}/complete`, (route) =>
    route.fulfill({ status: 201, contentType: 'application/json', body: '{"completed":true}' }),
  );
  await page.route(`**/v1/readings/public/${publicSlug}/whatsapp-click`, (route) =>
    route.fulfill({ status: 201, contentType: 'application/json', body: '{"saved":true}' }),
  );

  await page.goto(`/oku/${publicSlug}?utm_source=instagram&utm_medium=social`);
  await expect(page.getByRole('heading', { name: reading.title })).toBeVisible();
  await expect(page.getByText('Okumana hoş geldin')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('public-reading-theme.png') });
  const lessonLink = page.getByRole('link', { name: 'Bilgi al' });
  await expect(lessonLink).toBeVisible();
  const firstLessonUrl = new URL((await lessonLink.getAttribute('href'))!);
  expect(firstLessonUrl.searchParams.get('text')).toContain('1. Bölüm');
  const sectionEndLayout = await page.evaluate(() => {
    const navigation = document.querySelector('.public-reader-navigation');
    const lesson = document.querySelector('.public-reading-private-lesson');
    if (!navigation || !lesson) return undefined;
    return {
      navigationTop: navigation.getBoundingClientRect().top + window.scrollY,
      lessonTop: lesson.getBoundingClientRect().top + window.scrollY,
      lessonHeight: lesson.getBoundingClientRect().height,
    };
  });
  if ((page.viewportSize()?.width ?? 1_000) <= 760) {
    expect(sectionEndLayout?.navigationTop).toBeLessThan(sectionEndLayout?.lessonTop ?? 0);
    expect(sectionEndLayout?.lessonHeight).toBeLessThan(240);
  } else {
    expect(sectionEndLayout?.lessonTop).toBeLessThan(sectionEndLayout?.navigationTop ?? 0);
  }
  await expect.poll(() => accessPayload?.source).toBe('instagram');
  expect(accessPayload?.medium).toBe('social');
  expect(accessPayload?.visitorId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
  );

  if ((page.viewportSize()?.width ?? 1_000) <= 760) {
    const sectionPicker = page.getByRole('combobox', { name: 'Bölüm seç' });
    await expect(sectionPicker).toBeVisible();
    await expect(sectionPicker.locator('option')).toHaveCount(5);
    await sectionPicker.selectOption('4');
  } else {
    await page.getByRole('button', { name: /5\. Bölüm/u }).click();
  }
  const lastLessonUrl = new URL((await lessonLink.getAttribute('href'))!);
  expect(lastLessonUrl.searchParams.get('text')).toContain('5. Bölüm');
  await page.getByRole('button', { name: 'Okumayı tamamla' }).click();
  await expect(page.getByRole('heading', { name: 'Okumayı tamamladın' })).toBeVisible();
  const whatsappLink = page.getByRole('link', { name: 'WhatsApp’tan düşünceni paylaş' });
  await expect(whatsappLink).toBeVisible();
  const whatsappUrl = new URL((await whatsappLink.getAttribute('href'))!);
  expect(whatsappUrl.hostname).toBe('wa.me');
  expect(whatsappUrl.pathname).toBe('/905428078429');
  expect(whatsappUrl.searchParams.get('text')).toContain(reading.title);

  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});

test('opens, advances and completes a reading without horizontal overflow', async ({ page }) => {
  await page.goto(`/read#${token}`);
  await expect(page.getByRole('heading', { name: reading.title })).toBeVisible();
  await expect(page.getByText('Merhaba Ayşe')).toBeVisible();

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const previousScrollPosition = await page.evaluate(() => window.scrollY);
  await page.getByRole('button', { name: /Sonraki/u }).click();
  await expect(page.getByText('Bölüm 2 / 5')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(previousScrollPosition);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const content = document.querySelector('.public-reader-content');
        if (!content) return Number.POSITIVE_INFINITY;
        const contentTop = content.getBoundingClientRect().top + window.scrollY;
        return Math.abs(window.scrollY - contentTop);
      }),
    )
    .toBeLessThanOrEqual(3);

  if ((page.viewportSize()?.width ?? 1_000) <= 760) {
    const sectionPicker = page.getByRole('combobox', { name: 'Bölüm seç' });
    await expect(page.locator('.public-reader-mobile-sections')).toContainText('/ 5');
    await expect(sectionPicker.locator('option')).toHaveCount(5);
    await sectionPicker.selectOption('4');
  } else {
    await page.getByRole('button', { name: /5\. Bölüm/u }).click();
  }
  await expect(page.getByText('Bölüm 5 / 5')).toBeVisible();
  await page
    .getByPlaceholder('Birkaç cümleyle paylaşabilirsin...')
    .fill('Bende en çok orta yol düşüncesi kaldı.');
  await page.getByRole('button', { name: 'Okumayı tamamla' }).click();
  await expect(page.getByRole('heading', { name: 'Okumayı tamamladın' })).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    contentPaddingLeft: Number.parseFloat(
      window.getComputedStyle(document.querySelector('.public-reader-content')!).paddingLeft,
    ),
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  expect(dimensions.contentPaddingLeft).toBeGreaterThanOrEqual(20);
});

test('shows the reading library and section preview in the admin portal', async ({
  page,
}, testInfo) => {
  const summary = {
    id: 'reading-1',
    title: reading.title,
    description: reading.description,
    author: reading.author,
    estimatedMinutes: reading.estimatedMinutes,
    status: 'PUBLISHED',
    allowAgent: false,
    version: 2,
    updatedAt: '2026-07-29T12:00:00.000Z',
    pdfByteSize: 480_000,
    _count: { sections: 5, assignments: 1 },
    assignmentCounts: { ASSIGNED: 1, OPENED: 0, COMPLETED: 0 },
  };
  const detail = {
    ...summary,
    sourceFilename: 'aydinlanma-gecesi.md',
    sourceByteSize: 82_000,
    pdfFilename: 'aydinlanma-gecesi.pdf',
    sections: reading.sections.map((section, index) => ({
      ...section,
      id: `section-${index + 1}`,
    })),
    assignments: [],
  };

  await page.route('**/v1/admin/auth/refresh', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: '{"csrfToken":"reading-e2e-csrf"}',
    }),
  );
  await page.route('**/v1/admin/readings/reading-1', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(detail) }),
  );
  await page.route('**/v1/admin/readings', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([summary]),
    }),
  );
  await page.route('**/v1/admin/students', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            id: 'student-1',
            fullName: 'Ayşe Yılmaz',
            status: 'ACTIVE',
            channel: { type: 'TELEGRAM' },
          },
        ],
      }),
    }),
  );
  await page.route('**/v1/admin/readings/reading-1/public-share', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    const payload = (await route.request().postDataJSON()) as { slug: string };
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'public-share-1',
        readingId: 'reading-1',
        slug: payload.slug,
        status: 'ACTIVE',
        effectiveStatus: 'ACTIVE',
        allowPdf: false,
        allowIndexing: false,
        expiresAt: null,
        version: 1,
        publicUrl: `http://localhost:3001/oku/${payload.slug}`,
        readingTitle: reading.title,
        hasPdf: true,
        metrics: {
          totalViews: 0,
          totalPdfDownloads: 0,
          whatsappClicks: 0,
          uniqueReaders: 0,
          activeReaders: 0,
          completedReaders: 0,
          completionRate: 0,
          averageProgress: 0,
          sources: [],
        },
      }),
    });
  });

  await page.goto('/readings');
  await expect(page.getByRole('heading', { name: 'Okumalar' })).toBeVisible();
  await expect(page.getByText(reading.title).first()).toBeVisible();
  await expect(page.getByText('aydinlanma-gecesi.pdf')).toBeVisible();
  await expect(page.getByText('Bu bölümün okuma metni.').first()).toBeVisible();
  await page.getByRole('button', { name: 'Herkese açık paylaş' }).click();
  await expect(page.getByRole('heading', { name: 'Herkese açık paylaşım' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Bağlantı adı' })).toHaveValue(
    'buddha-nin-aydinlanma-gecesi',
  );
  await page.getByRole('button', { name: 'Bağlantı oluştur' }).click();
  await expect(page.getByText('Okuma performansı')).toBeVisible();
  await expect(page.getByText('Instagram paylaşımı')).toBeVisible();
  const actionSpacing = await page.locator('.reading-public-actions').evaluate((element) => {
    const [pause, save] = Array.from(element.querySelectorAll('button')).map((button) =>
      button.getBoundingClientRect(),
    );
    if (!pause || !save) return -1;
    return Math.max(
      save.left - pause.right,
      pause.left - save.right,
      save.top - pause.bottom,
      pause.top - save.bottom,
    );
  });
  expect(actionSpacing).toBeGreaterThanOrEqual(12);

  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

  async function expectDialogActions(dialogName: string, screenshotName: string) {
    const dialog = page.getByRole('dialog', { name: dialogName });
    const footer = dialog.locator('footer');
    const buttons = footer.getByRole('button');
    await expect(buttons).toHaveCount(2);
    const [firstButtonBox, lastButtonBox] = await Promise.all([
      buttons.first().boundingBox(),
      buttons.last().boundingBox(),
    ]);
    expect(
      (lastButtonBox?.x ?? 0) - ((firstButtonBox?.x ?? 0) + (firstButtonBox?.width ?? 0)),
    ).toBeGreaterThanOrEqual(12);
    await dialog.screenshot({ path: testInfo.outputPath(screenshotName) });
  }

  await page.getByRole('dialog').getByRole('button', { name: 'Pencereyi kapat' }).click();
  await page.getByRole('button', { name: 'Yeni okuma' }).click();
  await expectDialogActions('Yeni okuma yükle', 'new-reading-dialog.png');
  await page.getByRole('button', { name: 'Vazgeç' }).click();

  await page.getByRole('button', { name: 'Öğrenciye ata' }).click();
  await expectDialogActions('Öğrencilere ata', 'assign-reading-dialog.png');
  await page.getByRole('button', { name: 'Vazgeç' }).click();

  await page.getByRole('button', { name: 'Sil' }).click();
  await expectDialogActions('Okumayı sil', 'delete-reading-dialog.png');
});
