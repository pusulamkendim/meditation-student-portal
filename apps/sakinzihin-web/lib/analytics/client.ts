import { apiUrl } from '../api/client';

export type AnalyticsEventName =
  | 'page_view'
  | 'landing_view'
  | 'reading_view'
  | 'reading_cta_click'
  | 'meditation_view'
  | 'meditation_start'
  | 'meditation_complete'
  | 'one_to_one_page_view'
  | 'one_to_one_cta_click'
  | 'whatsapp_click'
  | 'intro_call_click'
  | 'corporate_page_view'
  | 'corporate_inquiry_start'
  | 'corporate_inquiry_submit';

export interface AnalyticsProperties {
  slug?: string;
  href?: string;
  location?: string;
  [key: string]: string | number | boolean | undefined;
}

type QueuedAnalyticsEvent = {
  event: AnalyticsEventName;
  properties: AnalyticsProperties;
};

type AnalyticsAttribution = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  referrer?: string;
};

const analyticsEndpoint = apiUrl('/v1/public/analytics/events');
const attributionStorageKey = 'sakinzihin-analytics-attribution';
const analyticsOptOutStorageKey = 'sakinzihin-analytics-opt-out';
const sessionStorageKey = 'sakinzihin-analytics-session';
const maxQueuedEvents = 50;
let queuedEvents: QueuedAnalyticsEvent[] = [];
let sessionId: string | undefined;

declare global {
  interface Window {
    SakinZihinAnalytics?: {
      track: (event: AnalyticsEventName, properties?: AnalyticsProperties) => void;
    };
  }
}

export function track(event: AnalyticsEventName, properties: AnalyticsProperties = {}): void {
  if (typeof window === 'undefined') return;
  const provider = window.SakinZihinAnalytics;
  if (!provider) {
    if (queuedEvents.length < maxQueuedEvents) queuedEvents.push({ event, properties });
    return;
  }
  try {
    provider.track(event, properties);
  } catch {
    // Analytics must never affect the public-site experience.
  }
}

function safeSessionStorage(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

function safeLocalStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function textValue(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function createSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replaceAll('-', '');
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`.slice(0, 64);
}

function getSessionId(): string {
  if (sessionId) return sessionId;
  const storage = safeSessionStorage();
  let stored: string | null = null;
  try {
    stored = storage?.getItem(sessionStorageKey) ?? null;
  } catch {
    stored = null;
  }
  if (stored && /^[A-Za-z0-9_-]{16,100}$/u.test(stored)) {
    sessionId = stored;
    return stored;
  }
  sessionId = createSessionId();
  try {
    storage?.setItem(sessionStorageKey, sessionId);
  } catch {
    // Private browsing and blocked storage are valid browser configurations.
  }
  return sessionId;
}

function safeReferrer(value: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    return `${url.origin}${url.pathname}`.slice(0, 2_048);
  } catch {
    return undefined;
  }
}

function readAttribution(): AnalyticsAttribution {
  const storage = safeSessionStorage();
  let attribution: AnalyticsAttribution = {};
  try {
    const stored = storage?.getItem(attributionStorageKey);
    if (stored) {
      const parsed = JSON.parse(stored) as Record<string, unknown>;
      attribution = {
        utm_source: textValue(parsed.utm_source, 100),
        utm_medium: textValue(parsed.utm_medium, 100),
        utm_campaign: textValue(parsed.utm_campaign, 160),
        referrer: safeReferrer(textValue(parsed.referrer, 2_048) ?? ''),
      };
    }
  } catch {
    attribution = {};
  }

  const query = new URLSearchParams(window.location.search);
  const current: AnalyticsAttribution = {
    utm_source: textValue(query.get('utm_source'), 100),
    utm_medium: textValue(query.get('utm_medium'), 100),
    utm_campaign: textValue(query.get('utm_campaign'), 160),
    referrer: safeReferrer(document.referrer),
  };
  const next = {
    ...attribution,
    ...(current.utm_source ? { utm_source: current.utm_source } : {}),
    ...(current.utm_medium ? { utm_medium: current.utm_medium } : {}),
    ...(current.utm_campaign ? { utm_campaign: current.utm_campaign } : {}),
    ...(!attribution.referrer && current.referrer ? { referrer: current.referrer } : {}),
  } satisfies AnalyticsAttribution;

  try {
    storage?.setItem(attributionStorageKey, JSON.stringify(next));
  } catch {
    // Attribution is best effort and never blocks tracking.
  }
  return next;
}

export function getAnalyticsContext(): {
  sessionId?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
} {
  if (typeof window === 'undefined') return {};
  const attribution = readAttribution();
  return {
    sessionId: getSessionId(),
    ...(attribution.utm_source ? { utm_source: attribution.utm_source } : {}),
    ...(attribution.utm_medium ? { utm_medium: attribution.utm_medium } : {}),
    ...(attribution.utm_campaign ? { utm_campaign: attribution.utm_campaign } : {}),
  };
}

function buildPayload(event: AnalyticsEventName, properties: AnalyticsProperties) {
  const attribution = readAttribution();
  const slug = textValue(properties.slug, 200);
  const location = textValue(properties.location, 120);
  return {
    event,
    sessionId: getSessionId(),
    pathname: window.location.pathname.slice(0, 2_048) || '/',
    ...(slug ? { slug } : {}),
    ...(location ? { location } : {}),
    ...(attribution.utm_source ? { utm_source: attribution.utm_source } : {}),
    ...(attribution.utm_medium ? { utm_medium: attribution.utm_medium } : {}),
    ...(attribution.utm_campaign ? { utm_campaign: attribution.utm_campaign } : {}),
    ...(attribution.referrer ? { referrer: attribution.referrer } : {}),
  };
}

function isLocalAnalyticsHost(hostname: string): boolean {
  const value = hostname.trim().toLocaleLowerCase('en-US');
  return (
    value === 'localhost' ||
    value === '127.0.0.1' ||
    value === '0.0.0.0' ||
    value === '::1' ||
    value === '[::1]' ||
    value.endsWith('.localhost') ||
    value.endsWith('.local')
  );
}

function isAnalyticsDisabledForBrowser(): boolean {
  const storage = safeLocalStorage();
  const preference = new URLSearchParams(window.location.search).get('analytics');

  try {
    if (preference === 'off') {
      storage?.setItem(analyticsOptOutStorageKey, '1');
      return true;
    }
    if (preference === 'on') {
      storage?.removeItem(analyticsOptOutStorageKey);
      return false;
    }
    return storage?.getItem(analyticsOptOutStorageKey) === '1';
  } catch {
    return preference === 'off';
  }
}

function send(event: AnalyticsEventName, properties: AnalyticsProperties = {}): void {
  if (isLocalAnalyticsHost(window.location.hostname) || isAnalyticsDisabledForBrowser()) return;
  const body = JSON.stringify(buildPayload(event, properties));
  try {
    if (
      typeof navigator.sendBeacon === 'function' &&
      navigator.sendBeacon(analyticsEndpoint, new Blob([body], { type: 'application/json' }))
    ) {
      return;
    }
  } catch {
    // Fall back to fetch when Beacon is unavailable or rejected.
  }
  void fetch(analyticsEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true,
    credentials: 'omit',
  }).catch(() => undefined);
}

export function initializeAnalytics(): void {
  if (typeof window === 'undefined' || window.SakinZihinAnalytics) return;
  window.SakinZihinAnalytics = { track: send };
  const pending = queuedEvents;
  queuedEvents = [];
  pending.forEach(({ event, properties }) => send(event, properties));
}
