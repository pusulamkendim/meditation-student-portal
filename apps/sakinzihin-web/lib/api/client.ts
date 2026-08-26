import type {
  HubCatalog,
  PublicMeditationMeta,
  PublicReadingContent,
  PublicReadingMeta,
} from './types';
import { siteConfig } from '../config/site';

type PublicFetchOptions = RequestInit & {
  next?: { revalidate?: number; tags?: string[] };
};

async function publicFetch<T>(path: string, options: PublicFetchOptions = {}): Promise<T> {
  const response = await fetch(`${siteConfig.apiUrl}${path}`, {
    ...options,
    headers: { accept: 'application/json', ...options.headers },
  });

  if (!response.ok) {
    throw new Error(`Public API request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function getHub(): Promise<HubCatalog | null> {
  try {
    return await publicFetch<HubCatalog>('/v1/public/hub', {
      next: { revalidate: 60, tags: ['public-hub'] },
    });
  } catch {
    return null;
  }
}

export async function getReadingMeta(slug: string): Promise<PublicReadingMeta | null> {
  try {
    return await publicFetch<PublicReadingMeta>(
      `/v1/readings/public/${encodeURIComponent(slug)}/meta`,
      { next: { revalidate: 60, tags: [`reading-meta:${slug}`] } },
    );
  } catch {
    return null;
  }
}

export async function getReadingContent(slug: string): Promise<PublicReadingContent | null> {
  try {
    return await publicFetch<PublicReadingContent>(
      `/v1/readings/public/${encodeURIComponent(slug)}/content`,
      { next: { revalidate: 60, tags: [`reading-content:${slug}`] } },
    );
  } catch {
    return null;
  }
}

export async function getMeditationMeta(slug: string): Promise<PublicMeditationMeta | null> {
  try {
    return await publicFetch<PublicMeditationMeta>(
      `/v1/public/meditations/${encodeURIComponent(slug)}/meta`,
      { next: { revalidate: 60, tags: [`meditation-meta:${slug}`] } },
    );
  } catch {
    return null;
  }
}

export function apiUrl(path: string): string {
  return `${siteConfig.apiUrl}${path}`;
}
