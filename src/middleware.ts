import { NextResponse, type NextRequest } from 'next/server';
import { CONSOLE_COOKIE, consoleAuthEnabled, verifySessionToken } from '@/lib/console-auth';

/**
 * Edge middleware. Two jobs only — anything that needs Prisma lives in
 * `src/lib/api-auth.ts` instead, because the Edge runtime cannot open SQLite.
 *
 *   1. Stamp every request with a correlation id and hardening headers.
 *   2. Gate the operator console behind the shared password, leaving
 *      /api/v1/* (key-authenticated) and /api/webhook (Meta-signed) untouched.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isConsole =
    !pathname.startsWith('/api/') &&
    !pathname.startsWith('/login') &&
    !pathname.startsWith('/_next') &&
    !pathname.startsWith('/favicon');

  if (isConsole && consoleAuthEnabled()) {
    return verifySessionToken(req.cookies.get(CONSOLE_COOKIE)?.value).then((valid) => {
      if (valid) return decorate(req, NextResponse.next());
      const url = req.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('next', pathname);
      return decorate(req, NextResponse.redirect(url));
    });
  }

  return decorate(req, NextResponse.next());
}

function decorate(req: NextRequest, res: NextResponse): NextResponse {
  const rid =
    req.headers.get('x-request-id') ??
    crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  res.headers.set('X-Request-Id', rid);
  res.headers.set('X-Frame-Options', 'SAMEORIGIN');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'no-referrer');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
