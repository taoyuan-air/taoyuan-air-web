import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/dashboard', '/auth/login', '/auth/register', '/'];
const AUTH_PATHS = ['/auth/login', '/auth/register'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const accessToken = request.cookies.get('access_token')?.value;

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );

  if (!accessToken && !isPublic) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  if (accessToken && AUTH_PATHS.includes(pathname)) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
