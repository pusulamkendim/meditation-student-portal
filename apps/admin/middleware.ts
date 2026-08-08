import { type NextRequest, NextResponse } from 'next/server';

const publicHosts = new Set(['sakinzihin.com', 'www.sakinzihin.com']);
const publicPrefixes = ['/oku/', '/meditasyon/', '/karne/'];
const publicFiles = new Set(['/robots.txt', '/sitemap.xml']);

export function middleware(request: NextRequest) {
  const host = (request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '')
    .split(':')[0]
    .toLowerCase();
  if (!publicHosts.has(host)) return NextResponse.next();

  const url = request.nextUrl.clone();
  if (host === 'www.sakinzihin.com') {
    url.host = 'sakinzihin.com';
    url.port = '';
    url.protocol = 'https:';
    return NextResponse.redirect(url, 308);
  }

  if (url.pathname === '/kesfet') {
    url.pathname = '/';
    return NextResponse.redirect(url, 308);
  }

  if (url.pathname === '/') {
    url.pathname = '/kesfet';
    return NextResponse.rewrite(url);
  }

  const isPublicRoute =
    publicPrefixes.some((prefix) => url.pathname.startsWith(prefix)) ||
    publicFiles.has(url.pathname) ||
    url.pathname.startsWith('/_next/') ||
    /\.[a-z0-9]+$/iu.test(url.pathname);
  if (isPublicRoute) return NextResponse.next();

  url.pathname = '/';
  url.search = '';
  return NextResponse.redirect(url, 302);
}

export const config = {
  matcher: '/:path*',
};
