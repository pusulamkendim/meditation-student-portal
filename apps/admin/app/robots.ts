import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/oku/', '/meditasyon/'],
      disallow: [
        '/login',
        '/students',
        '/payments',
        '/practice',
        '/meetings',
        '/conversations',
        '/operations',
        '/knowledge',
        '/readings',
        '/meditations',
        '/drawings',
        '/llm',
        '/standard-messages',
        '/ui-preview',
      ],
    },
    sitemap: 'https://sakinzihin.com/sitemap.xml',
  };
}
