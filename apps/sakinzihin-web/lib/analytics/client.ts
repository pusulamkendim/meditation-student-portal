export type AnalyticsEventName =
  | 'landing_view'
  | 'reading_view'
  | 'reading_cta_click'
  | 'meditation_view'
  | 'meditation_start'
  | 'meditation_complete'
  | 'one_to_one_page_view'
  | 'one_to_one_cta_click'
  | 'whatsapp_click'
  | 'intro_call_click';

export interface AnalyticsProperties {
  slug?: string;
  href?: string;
  location?: string;
  [key: string]: string | number | boolean | undefined;
}

declare global {
  interface Window {
    SakinZihinAnalytics?: {
      track: (event: AnalyticsEventName, properties?: AnalyticsProperties) => void;
    };
  }
}

export function track(event: AnalyticsEventName, properties: AnalyticsProperties = {}): void {
  if (typeof window === 'undefined') return;
  window.SakinZihinAnalytics?.track(event, properties);
}
