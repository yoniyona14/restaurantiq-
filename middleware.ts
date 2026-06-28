// middleware.ts — runs on every request
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { canAccess, ROLE_HOME } from '@/lib/access'
import type { UserRole } from '@/types'

const PUBLIC_ROUTES = ['/auth/login', '/auth/forgot-password', '/menu']

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const pathname = request.nextUrl.pathname

  function redirectTo(path: string) {
    const redirectResponse = NextResponse.redirect(new URL(path, request.url))
    response.cookies.getAll().forEach(cookie => {
      redirectResponse.cookies.set(cookie.name, cookie.value)
    })
    return redirectResponse
  }

  if (PUBLIC_ROUTES.some(r => pathname.startsWith(r))) return response

  if (!user) {
    if (pathname.startsWith('/auth')) return response
    return redirectTo('/auth/login')
  }

  if (pathname.startsWith('/auth')) {
    return redirectTo('/dashboard')
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = profile?.role as UserRole | undefined

  if (role && !canAccess(role, pathname)) {
    return redirectTo(ROLE_HOME[role] ?? '/dashboard')
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}