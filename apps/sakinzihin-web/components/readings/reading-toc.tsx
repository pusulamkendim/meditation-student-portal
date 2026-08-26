import { List } from 'lucide-react';

import type { ReadingSection } from '../../lib/api/types';

export function ReadingToc({ sections }: { sections: ReadingSection[] }) {
  if (sections.length < 2) return null;

  return (
    <details className="reading-toc-mobile">
      <summary>
        <span>
          <List size={17} /> Bu yazıda
        </span>
        <span aria-hidden="true">⌄</span>
      </summary>
      <TocList sections={sections} />
    </details>
  );
}

export function ReadingTocDesktop({ sections }: { sections: ReadingSection[] }) {
  if (sections.length < 2) return null;

  return (
    <aside className="reading-toc-desktop" aria-label="Bu yazıda">
      <span className="toc-label">Bu yazıda</span>
      <TocList sections={sections} />
    </aside>
  );
}

function TocList({ sections }: { sections: ReadingSection[] }) {
  return (
    <nav>
      <ol>
        {sections.map((section) => (
          <li key={section.position}>
            <a href={`#reading-section-${section.position}`}>
              <span aria-hidden="true">▹</span>
              {section.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
