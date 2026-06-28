// app/api/staff/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = createClient()

  // Confirm the requester is logged in and is owner/manager.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: requester } = await supabase
    .from('users')
    .select('role, restaurant_id')
    .eq('id', user.id)
    .single()

  if (!requester || !['owner', 'manager'].includes(requester.role)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const body = await request.json()
  const { name, email, password, role, phone, salary } = body

  if (!name || !email || !password || !role) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (!['owner', 'manager', 'cashier', 'kitchen'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
  }

  const admin = createAdminClient()

  // 1. Create the auth login.
  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // skip email verification — internal staff accounts
  })

  if (authError || !created.user) {
    return NextResponse.json({ error: authError?.message ?? 'Failed to create login' }, { status: 400 })
  }

  // 2. Create the matching profile row with the chosen role.
  const { error: profileError } = await admin.from('users').insert({
    id: created.user.id,
    restaurant_id: requester.restaurant_id,
    name,
    email,
    role,
    phone: phone || null,
    salary: salary || 0,
  })

  if (profileError) {
    // Roll back the auth user so we don't end up with a login that has no profile.
    await admin.auth.admin.deleteUser(created.user.id)
    return NextResponse.json({ error: profileError.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}