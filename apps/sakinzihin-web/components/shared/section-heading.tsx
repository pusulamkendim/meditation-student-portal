import type { ReactNode } from 'react';

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  light = false,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  light?: boolean;
}) {
  return (
    <div className={`section-heading ${light ? 'section-heading-light' : ''}`}>
      <div>
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className="section-heading-action">{action}</div> : null}
    </div>
  );
}
