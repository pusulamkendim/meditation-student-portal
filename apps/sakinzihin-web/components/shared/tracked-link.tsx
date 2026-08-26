'use client';

import Link from 'next/link';
import type { AnchorHTMLAttributes, ReactNode } from 'react';

import { track, type AnalyticsEventName } from '../../lib/analytics/client';

type TrackedLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick'> & {
  href: string;
  event?: AnalyticsEventName;
  eventProperties?: Record<string, string | number | boolean | undefined>;
  onClick?: () => void;
  children: ReactNode;
};

export function TrackedLink({
  href,
  event,
  eventProperties,
  onClick: onLinkClick,
  children,
  target,
  rel,
  ...props
}: TrackedLinkProps) {
  const onClick = () => {
    if (event) track(event, { href, ...eventProperties });
    onLinkClick?.();
  };

  if (href.startsWith('http')) {
    return (
      <a
        {...props}
        href={href}
        target={target ?? '_blank'}
        rel={rel ?? 'noreferrer'}
        onClick={onClick}
      >
        {children}
      </a>
    );
  }

  return (
    <Link {...props} href={href} onClick={onClick}>
      {children}
    </Link>
  );
}
