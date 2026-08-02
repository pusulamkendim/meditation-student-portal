'use client';

import PracticePlayerPage from '../page';

export default function PublicMeditationPlayer({ slug }: { slug: string }) {
  return <PracticePlayerPage publicSlug={slug} />;
}
