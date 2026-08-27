export type MeditationLevel = 'INTRODUCTION' | 'INTERMEDIATE' | 'ADVANCED';

export interface HubReading {
  slug: string;
  title: string;
  description: string | null;
  author: string | null;
  estimatedMinutes: number | null;
  sectionCount: number;
  hasPdf: boolean;
  allowIndexing: boolean;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  updatedAt: string;
}

export interface HubMeditation {
  slug: string;
  title: string;
  description: string | null;
  level: MeditationLevel;
  guided: boolean;
  durations: number[];
  defaultDurationMinutes: number;
  allowDurationSelection: boolean;
  allowIndexing: boolean;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
  updatedAt: string;
}

export interface HubCatalog {
  readings: HubReading[];
  meditations: HubMeditation[];
  generatedAt: string;
}

export interface ReadingSection {
  position: number;
  title: string;
  contentMarkdown: string;
  wordCount: number;
}

export interface PublicReadingMeta {
  slug: string;
  title: string;
  description: string | null;
  author: string | null;
  estimatedMinutes: number | null;
  sectionCount: number;
  allowIndexing: boolean;
  canonicalUrl: string;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
}

export interface PublicReadingContent extends PublicReadingMeta {
  hasPdf: boolean;
  updatedAt: string;
  sections: ReadingSection[];
}

export interface PublicMeditationMeta {
  slug: string;
  title: string;
  description: string | null;
  guided: boolean;
  allowIndexing: boolean;
  canonicalUrl: string;
  durations: number[];
  defaultDurationMinutes: number;
  allowDurationSelection: boolean;
  coverImageUrl: string | null;
  coverImageAlt: string | null;
}
