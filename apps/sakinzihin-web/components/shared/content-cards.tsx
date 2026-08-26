import Image from 'next/image';
import { ArrowUpRight, Clock3, Headphones } from 'lucide-react';
import Link from 'next/link';

import type { HubMeditation, HubReading } from '../../lib/api/types';
import { imageForContent } from '../../lib/content/images';

const levelLabels = {
  INTRODUCTION: 'Başlangıç',
  INTERMEDIATE: 'Orta seviye',
  ADVANCED: 'İleri seviye',
} as const;

export function ReadingCard({ reading, index = 0 }: { reading: HubReading; index?: number }) {
  const image = imageForContent(reading.slug, index);
  return (
    <Link className="reading-card" href={`/oku/${reading.slug}`}>
      <div className="card-image card-image-reading">
        <Image src={image.src} alt={image.alt} fill sizes="(max-width: 700px) 100vw, 33vw" />
        <span className="image-chip">
          <Clock3 size={13} /> {reading.estimatedMinutes ?? '—'} dk okuma
        </span>
      </div>
      <div className="card-body">
        <div className="card-kicker">Okuma</div>
        <h3>{reading.title}</h3>
        {reading.description ? <p>{reading.description}</p> : null}
        <span className="card-mobile-meta">{reading.estimatedMinutes ?? '—'} dk okuma</span>
        <span className="card-arrow" aria-hidden="true">
          <ArrowUpRight size={18} />
        </span>
      </div>
    </Link>
  );
}

export function MeditationCard({
  meditation,
  index = 0,
}: {
  meditation: HubMeditation;
  index?: number;
}) {
  const image = imageForContent(meditation.slug, index + 2);
  return (
    <Link className="meditation-card" href={`/meditasyon/${meditation.slug}`}>
      <div className="card-image card-image-meditation">
        <Image src={image.src} alt={image.alt} fill sizes="(max-width: 700px) 100vw, 33vw" />
        <span className="image-chip image-chip-dark">
          <Clock3 size={13} /> {meditation.defaultDurationMinutes} dk
        </span>
        <span className="play-badge" aria-hidden="true">
          <Headphones size={16} />
        </span>
      </div>
      <div className="card-body">
        <div className="card-kicker">{levelLabels[meditation.level]}</div>
        <h3>{meditation.title}</h3>
        {meditation.description ? <p>{meditation.description}</p> : null}
        <span className="card-arrow" aria-hidden="true">
          <ArrowUpRight size={18} />
        </span>
      </div>
    </Link>
  );
}
