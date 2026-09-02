import { beforeEach, describe, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({
  pathname: '/' as string | null,
  lastPath: { current: null as string | null },
  effect: undefined as (() => void) | undefined,
}));

vi.mock('next/navigation', () => ({ usePathname: () => hooks.pathname }));
vi.mock('react', () => ({
  useRef: () => hooks.lastPath,
  useEffect: (effect: () => void) => {
    hooks.effect = effect;
  },
}));
vi.mock('../../lib/analytics/client', () => ({
  initializeAnalytics: vi.fn(),
  track: vi.fn(),
}));

import { initializeAnalytics, track } from '../../lib/analytics/client';
import { AnalyticsInitializer } from './analytics-initializer';

function render(pathname: string | null) {
  hooks.pathname = pathname;
  AnalyticsInitializer();
  hooks.effect?.();
}

describe('AnalyticsInitializer page views', () => {
  beforeEach(() => {
    hooks.pathname = '/';
    hooks.lastPath = { current: null };
    hooks.effect = undefined;
  });

  it.each(['/', '/oku/nefes', '/meditasyon/nefes', '/pratik', '/hakkimda', '/birebir-meditasyon'])(
    'tracks a direct entry to %s once after initializing the provider',
    (pathname) => {
      render(pathname);

      expect(track).toHaveBeenCalledExactlyOnceWith('page_view');
      expect(vi.mocked(initializeAnalytics).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(track).mock.invocationCallOrder[0],
      );
    },
  );

  it('ignores Strict Mode effect replays and rerenders on the same pathname', () => {
    render('/pratik');
    hooks.effect?.();
    render('/pratik');

    expect(track).toHaveBeenCalledExactlyOnceWith('page_view');
  });

  it('counts each navigation including returning to a previously viewed pathname', () => {
    for (const pathname of ['/pratik', '/hakkimda', '/pratik']) {
      render(pathname);
      hooks.effect?.();
    }

    expect(track).toHaveBeenCalledTimes(3);
    expect(track).toHaveBeenNthCalledWith(3, 'page_view');
  });

  it('waits for a pathname to be available', () => {
    render(null);
    expect(track).not.toHaveBeenCalled();

    render('/oku/nefes');
    expect(track).toHaveBeenCalledExactlyOnceWith('page_view');
  });

  it('counts a fresh mount after a full page reload', () => {
    render('/pratik');
    hooks.lastPath = { current: null };
    render('/pratik');

    expect(track).toHaveBeenCalledTimes(2);
  });
});
