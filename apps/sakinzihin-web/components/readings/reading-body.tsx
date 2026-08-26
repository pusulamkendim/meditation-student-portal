import ReactMarkdown from 'react-markdown';

import type { ReadingSection } from '../../lib/api/types';

export function ReadingBody({ sections }: { sections: ReadingSection[] }) {
  return (
    <div className="reading-body">
      {sections.map((section) => (
        <section
          className="reading-section"
          id={`reading-section-${section.position}`}
          key={section.position}
        >
          <div className="reading-section-heading">
            <span>{String(section.position).padStart(2, '0')}</span>
            <h2>{section.title}</h2>
          </div>
          <div className="reading-markdown">
            <ReactMarkdown
              components={{
                a: ({ href, children }) => (
                  <a
                    href={href}
                    target={href?.startsWith('http') ? '_blank' : undefined}
                    rel={href?.startsWith('http') ? 'noreferrer' : undefined}
                  >
                    {children}
                  </a>
                ),
              }}
            >
              {section.contentMarkdown}
            </ReactMarkdown>
          </div>
        </section>
      ))}
      <div className="reading-end" id="reading-end" aria-hidden="true" />
    </div>
  );
}
