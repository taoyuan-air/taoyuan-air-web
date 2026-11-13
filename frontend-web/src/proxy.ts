import { NextRequest, NextResponse } from 'next/server';

const AUTH_PATHS = ['/login', '/register'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const accessToken = request.cookies.get('access_token')?.value;

  // 已登入的使用者造訪登入/註冊頁面時，導回 dashboard
  // 用 nextUrl.clone() 而非 new URL(...)，確保 basePath（例如 /tyair）不會在 redirect 時被丟掉
  if (accessToken && AUTH_PATHS.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
