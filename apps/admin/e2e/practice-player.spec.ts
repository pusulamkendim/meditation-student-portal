import { expect, test } from '@playwright/test';

const accessCode = 'K7p2xQ9dL4w8nR6sT3v5Za';

test.beforeEach(async ({ page }) => {
  await page.route('**/v1/public/practices/access', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        title: 'Doğal Nefes Farkındalığı',
        description: 'Nefesi değiştirmeden, doğal akışında gözlemle.',
        startsAt: '2026-07-29T18:00:00.000Z',
        durationMinutes: 1,
        guided: false,
      }),
    }),
  );
});

test('runs, pauses and restarts a timed practice without horizontal overflow', async ({
  page,
}, testInfo) => {
  await page.goto(`/m#${accessCode}`);

  await expect(page.getByRole('heading', { name: 'Doğal Nefes Farkındalığı' })).toBeVisible();
  await expect(page.getByText('01:00')).toBeVisible();
  await page.getByRole('button', { name: 'Başlat' }).click();
  await expect(page.getByRole('button', { name: 'Duraklat' })).toBeVisible();
  await expect
    .poll(async () => {
      const value = (await page.locator('.practice-player-clock strong').textContent()) ?? '01:00';
      const [minutes, seconds] = value.split(':').map(Number);
      return minutes * 60 + seconds;
    })
    .toBeLessThan(60);

  await page.getByRole('button', { name: 'Duraklat' }).click();
  await expect(page.getByRole('button', { name: 'Başlat' })).toBeVisible();
  const pausedAt = await page.locator('.practice-player-clock strong').textContent();
  await page.waitForTimeout(500);
  await expect(page.locator('.practice-player-clock strong')).toHaveText(pausedAt ?? '');

  await page.getByRole('button', { name: 'Başa dön' }).click();
  await expect(page.getByText('01:00')).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  await page.screenshot({
    path: testInfo.outputPath('practice-player.png'),
    fullPage: true,
  });
});

test('does not expose a short access code in the request URL', async ({ page }) => {
  let accessRequestUrl = '';
  let accessPayload: unknown;
  await page.unroute('**/v1/public/practices/access');
  await page.route('**/v1/public/practices/access', (route) => {
    accessRequestUrl = route.request().url();
    accessPayload = route.request().postDataJSON();
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        title: 'Sessiz pratik',
        startsAt: '2026-07-29T18:00:00.000Z',
        durationMinutes: 15,
        guided: false,
      }),
    });
  });

  await page.goto(`/m#${accessCode}`);
  await expect(page.getByRole('heading', { name: 'Sessiz pratik' })).toBeVisible();
  expect(accessRequestUrl).not.toContain(accessCode);
  expect(accessPayload).toEqual({ code: accessCode });
  expect(page.url()).toContain(`#${accessCode}`);
});

test('plays the amplified three-strike gong when the practice audio finishes', async ({ page }) => {
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () {
      this.dataset.playCount = String(Number(this.dataset.playCount ?? 0) + 1);
      this.dataset.lastPlayMuted = String(this.muted);
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function () {};
  });
  await page.unroute('**/v1/public/practices/access');
  await page.route('**/v1/public/practices/access', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        title: 'Yönlendirmeli pratik',
        startsAt: '2026-08-01T18:00:00.000Z',
        durationMinutes: 15,
        guided: true,
        audioUrl: 'http://localhost:3001/meditation/end-bell.m4a',
      }),
    }),
  );

  await page.goto(`/m#${accessCode}`);
  await expect(page.getByText('Sesli yönlendirme hazır')).toHaveCount(0);
  await page.getByRole('button', { name: 'Başlat' }).click();
  await page.getByTestId('practice-audio').dispatchEvent('ended');

  await expect(page.getByText('Pratik süren tamamlandı')).toBeVisible();
  await expect
    .poll(() =>
      page.getByTestId('end-bell').evaluate((element) => ({
        playCount: Number((element as HTMLAudioElement).dataset.playCount ?? 0),
        muted: (element as HTMLAudioElement).dataset.lastPlayMuted,
        source: new URL((element as HTMLAudioElement).src).pathname,
      })),
    )
    .toEqual({
      playCount: 2,
      muted: 'false',
      source: '/meditation/end-gong-three-strikes-v2.m4a',
    });
});

test('selects a duration and records public meditation start and completion', async ({
  page,
}, testInfo) => {
  const accesses: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () {
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function () {};
  });
  await page.route('**/v1/public/meditations/anapanasati/access', (route) => {
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    accesses.push(payload);
    const durationMinutes = Number(payload.durationMinutes ?? 10);
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        title: 'Anapanasati',
        description: 'Nefesi olduğu gibi izle.',
        durationMinutes,
        allowedDurations: [10, 20],
        allowDurationSelection: true,
        allowIndexing: false,
        guided: true,
        audioUrl: 'http://localhost:3001/meditation/end-bell.m4a',
        visitToken: `visit-${durationMinutes}`,
      }),
    });
  });
  await page.route('**/v1/public/meditations/events', (route) => {
    events.push(route.request().postDataJSON() as Record<string, unknown>);
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: '{"recorded":true}',
    });
  });

  await page.goto('/meditasyon/anapanasati?sure=10&utm_source=instagram');
  await expect(page.getByRole('heading', { name: 'Anapanasati' })).toBeVisible();
  await page.getByRole('button', { name: '20 dk' }).click();
  await expect(page.getByText('20:00')).toBeVisible();
  expect(accesses.at(-1)).toEqual(
    expect.objectContaining({ durationMinutes: 20, source: 'instagram' }),
  );

  await page.getByRole('button', { name: 'Başlat' }).click();
  await page.getByTestId('practice-audio').dispatchEvent('ended');
  await expect(page.getByText('Kendine ayırdığın bu alan tamamlandı.')).toBeVisible();
  await expect(page.getByText('BİREBİR MEDİTASYON')).toBeVisible();
  await expect(page.getByText(/Haftalık birebir görüşmeler/u)).toBeVisible();
  const cta = page.getByRole('link', { name: 'Programı konuşalım' });
  const href = await cta.getAttribute('href');
  expect(href).toContain('https://wa.me/905428078429?text=');
  expect(decodeURIComponent(href ?? '')).toContain(
    '“Anapanasati” meditasyonunu tamamladım. Birebir meditasyon hakkında bilgi almak istiyorum.',
  );
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  expect(dimensions.scrollHeight).toBeLessThanOrEqual(dimensions.clientHeight);
  await page.screenshot({
    path: testInfo.outputPath('public-meditation-cta.png'),
    fullPage: true,
  });
  await cta.click();
  await expect
    .poll(() => events)
    .toEqual([
      { token: 'visit-20', event: 'START' },
      { token: 'visit-20', event: 'COMPLETE' },
      { token: 'visit-20', event: 'CTA_VIEW' },
      { token: 'visit-20', event: 'CTA_CLICK' },
    ]);
});

test('does not show the acquisition CTA on an assigned student practice', async ({ page }) => {
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () {
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function () {};
  });
  await page.unroute('**/v1/public/practices/access');
  await page.route('**/v1/public/practices/access', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        title: 'Öğrenci pratiği',
        durationMinutes: 15,
        guided: true,
        audioUrl: 'http://localhost:3001/meditation/end-bell.m4a',
      }),
    }),
  );

  await page.goto(`/m#${accessCode}`);
  await page.getByRole('button', { name: 'Başlat' }).click();
  await page.getByTestId('practice-audio').dispatchEvent('ended');
  await expect(page.getByText('Pratik süren tamamlandı')).toBeVisible();
  await expect(page.getByText('BİREBİR MEDİTASYON')).toHaveCount(0);
});
