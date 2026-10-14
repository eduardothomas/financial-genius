import { NextResponse, type NextRequest } from 'next/server';

/** Autenticación básica: el panel es solo interno. */
export function middleware(req: NextRequest) {
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASSWORD;
  if (!user || !pass) return new NextResponse('Configura ADMIN_USER y ADMIN_PASSWORD', { status: 500 });
  const header = req.headers.get('authorization') ?? '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const [u, p] = atob(encoded).split(':');
    if (u === user && p === pass) return NextResponse.next();
  }
  return new NextResponse('Autenticación requerida', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Financial Genius admin"' },
  });
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
