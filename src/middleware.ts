import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/sign-in', '/sign-up', '/ping'];

const isPublicPath = (pathname: string) =>
  PUBLIC_PATHS.some((path) =>
    path === '/ping' ? pathname.startsWith('/ping') : pathname === path || pathname.startsWith(`${path}/`),
  );

const getSessionCookie = (request: NextRequest) => {
  const cookiePrefix = process.env.BETTER_AUTH_COOKIE_PREFIX ?? 'better-auth.';
  const baseName = `${cookiePrefix}session_token`;
  const secureName = `__Secure-${baseName}`;

  return (
    request.cookies.get(baseName)?.value ?? request.cookies.get(secureName)?.value ?? null
  );
};

const buildSignInRedirect = (request: NextRequest) => {
  const signInUrl = new URL('/sign-in', request.url);
  signInUrl.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(signInUrl);
};

const splitSetCookieHeader = (header: string): string[] => {
  const cookies: string[] = [];
  let buffer = '';
  let inExpiresSegment = false;

  for (let index = 0; index < header.length; index += 1) {
    const char = header[index];

    if (char === ',' && !inExpiresSegment) {
      if (buffer.trim().length > 0) {
        cookies.push(buffer.trim());
      }
      buffer = '';
      continue;
    }

    buffer += char;

    const probeStart = Math.max(0, index - 7);
    const lookBehind = header.slice(probeStart, index + 1).toLowerCase();

    if (!inExpiresSegment && lookBehind.endsWith('expires=')) {
      inExpiresSegment = true;
    } else if (inExpiresSegment && char === ';') {
      inExpiresSegment = false;
    }
  }

  if (buffer.trim().length > 0) {
    cookies.push(buffer.trim());
  }

  return cookies;
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie) {
    const anonymousUrl = new URL('/api/auth/sign-in/anonymous', request.url);

    let anonymousResponse: Response;

    try {
      anonymousResponse = await fetch(anonymousUrl, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          ...(request.nextUrl.origin ? { origin: request.nextUrl.origin } : {}),
          referer: request.url,
          ...(request.headers.get('cookie')
            ? { cookie: request.headers.get('cookie') as string }
            : {}),
        },
        body: '{}',
        cache: 'no-store',
      });
    } catch (error) {
      console.error('Failed to initiate anonymous session.', error);
      return buildSignInRedirect(request);
    }

    if (!anonymousResponse.ok) {
      console.error('Anonymous session endpoint returned non-success status.', {
        status: anonymousResponse.status,
        statusText: anonymousResponse.statusText,
      });
      return buildSignInRedirect(request);
    }

    const setCookieHeader = anonymousResponse.headers.get('set-cookie');

    if (!setCookieHeader) {
      console.error('Anonymous session endpoint did not include set-cookie header.');
      return buildSignInRedirect(request);
    }

    const sessionCookies = splitSetCookieHeader(setCookieHeader);

    if (sessionCookies.length === 0) {
      console.error('Unable to parse cookies from anonymous session response.');
      return buildSignInRedirect(request);
    }

    const requestHeaders = new Headers(request.headers);
    const existingCookieHeader = request.headers.get('cookie');
    const cookieTokens = sessionCookies
      .map((cookie) => cookie.split(';')[0])
      .filter(Boolean);

    const mergedCookieHeader = [existingCookieHeader, ...cookieTokens]
      .filter((value): value is string => {
        if (!value) {
          return false;
        }
        return value.trim().length > 0;
      })
      .join('; ');

    if (mergedCookieHeader.length > 0) {
      requestHeaders.set('cookie', mergedCookieHeader);
    }

    const response = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });

    sessionCookies.forEach((cookie) => {
      response.headers.append('set-cookie', cookie);
    });

    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|favicon.svg|manifest.webmanifest|robots.txt|sitemap.xml|api/auth|logo/).*)',
  ],
};
