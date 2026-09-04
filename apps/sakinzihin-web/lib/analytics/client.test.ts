import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('page_view analytics delivery', () => {
  const location = { hostname: 'sakinzihin.com', pathname: '/oku/nefes', search: '' };
  const sendBeacon = vi.fn();
  const fetch = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    const sessionStorage = new Map<string, string>();
    const localStorage = new Map<string, string>();
    location.hostname = 'sakinzihin.com';
    location.pathname = '/oku/nefes';
    location.search = '?utm_source=google&utm_medium=organic&utm_campaign=nefes';
    vi.stubGlobal('window', {
      location,
      sessionStorage: {
        getItem: (key: string) => sessionStorage.get(key) ?? null,
        setItem: (key: string, value: string) => sessionStorage.set(key, value),
      },
      localStorage: {
        getItem: (key: string) => localStorage.get(key) ?? null,
        setItem: (key: string, value: string) => localStorage.set(key, value),
        removeItem: (key: string) => localStorage.delete(key),
      },
    });
    vi.stubGlobal('document', { referrer: 'https://www.google.com/search?q=nefes#top' });
    sendBeacon.mockReturnValue(true);
    vi.stubGlobal('navigator', { sendBeacon });
    fetch.mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetch);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('sends the existing payload via Beacon and retains session attribution on navigation', async () => {
    const { initializeAnalytics, track } = await import('./client');
    initializeAnalytics();
    track('page_view');

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [endpoint, body] = sendBeacon.mock.calls[0] as [string, Blob];
    const first = JSON.parse(await body.text());
    expect(endpoint).toMatch(/\/v1\/public\/analytics\/events$/u);
    expect(first).toEqual({
      event: 'page_view',
      sessionId: expect.stringMatching(/^[A-Za-z0-9_-]{16,100}$/u),
      pathname: '/oku/nefes',
      utm_source: 'google',
      utm_medium: 'organic',
      utm_campaign: 'nefes',
      referrer: 'https://www.google.com/search',
    });
    expect(fetch).not.toHaveBeenCalled();

    location.pathname = '/meditasyon/nefes';
    location.search = '';
    track('page_view');

    const nextBody = sendBeacon.mock.calls[1][1] as Blob;
    expect(JSON.parse(await nextBody.text())).toEqual({
      ...first,
      pathname: '/meditasyon/nefes',
    });
  });

  it('uses the existing queue and fetch fallback without sending the queued event twice', async () => {
    const { initializeAnalytics, track } = await import('./client');
    sendBeacon.mockReturnValue(false);
    track('page_view');
    expect(fetch).not.toHaveBeenCalled();
    initializeAnalytics();
    initializeAnalytics();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/v1\/public\/analytics\/events$/u),
      expect.objectContaining({ method: 'POST', keepalive: true, credentials: 'omit' }),
    );
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
      event: 'page_view',
      pathname: '/oku/nefes',
    });
  });

  it.each(['localhost', '127.0.0.1', '::1', 'sakinzihin.local'])(
    'does not send local analytics from %s',
    async (hostname) => {
      location.hostname = hostname;
      const { initializeAnalytics, track } = await import('./client');
      initializeAnalytics();
      track('page_view');

      expect(sendBeacon).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('persists an analytics opt-out for personal testing until it is enabled again', async () => {
    const { initializeAnalytics, track } = await import('./client');
    initializeAnalytics();

    location.search = '?analytics=off';
    track('page_view');
    location.search = '';
    track('page_view');

    expect(sendBeacon).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();

    location.search = '?analytics=on';
    track('page_view');
    expect(sendBeacon).toHaveBeenCalledTimes(1);
  });
});
