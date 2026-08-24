'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, cn, ROLE_COLORS } from '@/lib/utils'
import { StaffMember, UserRole } from '@/types'
import { startOfMonth } from 'date-fns'
import toast from 'react-hot-toast'
import { Plus, X } from 'lucide-react'

const ROLES: UserRole[] = ['owner', 'manager', 'cashier', 'kitchen']

export default function StaffPage() {
  const supabase = createClient()
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [myRole, setMyRole] = useState<UserRole | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'cashier' as UserRole, phone: '', salary: '' })

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('users').select('restaurant_id, role').eq('id', user!.id).single()
    setMyRole(profile?.role ?? null)

    const { data: users } = await supabase.from('users').select('*').eq('restaurant_id', profile!.restaurant_id).order('name')

    const monthStart = startOfMonth(new Date()).toISOString()
    const enriched = await Promise.all((users ?? []).map(async (u) => {
      const { data: orders } = await supabase
        .from('orders')
        .select('total')
        .eq('cashier_id', u.id)
        .eq('status', 'completed')
        .gte('created_at', monthStart)
      return {
        ...u,
        orders_count: orders?.length ?? 0,
        revenue_generated: orders?.reduce((s, o) => s + o.total, 0) ?? 0,
      }
    }))

    setStaff(enriched.sort((a, b) => (b.revenue_generated ?? 0) - (a.revenue_generated ?? 0)))
    setLoading(false)
  }

  function resetForm() {
    setForm({ name: '', email: '', password: '', role: 'cashier', phone: '', salary: '' })
  }

  async function handleAddStaff(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          phone: form.phone,
          salary: form.salary ? Number(form.salary) : 0,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Failed to add staff member')
        return
      }
      toast.success(`${form.name} added as ${form.role}`)
      setShowModal(false)
      resetForm()
      load()
    } catch (err: any) {
      toast.error('Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Loading staff…</div>

  const maxRevenue = Math.max(...staff.map(s => s.revenue_generated ?? 0), 1)
  const canManageStaff = myRole === 'owner' || myRole === 'manager'

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Staff</h1>
          <p className="text-sm text-gray-500">{staff.length} team members · This month's performance</p>
        </div>
        {canManageStaff && (
          <button onClick={() => setShowModal(true)} className="btn-primary text-sm py-2 px-4">
            <Plus className="w-4 h-4" /> Add staff
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {staff.map((member, i) => {
          const score = Math.round(((member.revenue_generated ?? 0) / maxRevenue) * 100)
          return (
            <div key={member.id} className="card p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-semibold flex-shrink-0">
                    {member.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 flex items-center gap-1.5">
                      {member.name}
                      {i === 0 && (member.revenue_generated ?? 0) > 0 && <span title="Top performer">👑</span>}
                    </p>
                    <span className={cn('badge capitalize mt-1', ROLE_COLORS[member.role])}>{member.role}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="bg-gray-50 rounded-lg p-2.5">
                  <p className="text-xs text-gray-400">Orders</p>
                  <p className="text-sm font-semibold text-gray-900">{member.orders_count}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2.5">
                  <p className="text-xs text-gray-400">Revenue</p>
                  <p className="text-sm font-semibold text-emerald-600">{formatCurrency(member.revenue_generated ?? 0)}</p>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Productivity score</span><span>{score}%</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${score}%` }} />
                </div>
              </div>

              {member.phone && <p className="text-xs text-gray-400 mt-3">📞 {member.phone}</p>}
              {member.salary > 0 && <p className="text-xs text-gray-400 mt-1">💰 Salary: {formatCurrency(member.salary)}/mo</p>}
            </div>
          )
        })}
        {staff.length === 0 && <p className="text-sm text-gray-400 col-span-full text-center py-12">No staff members yet.</p>}
      </div>

      {/* Add Staff Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Add staff member</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddStaff} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Full name</label>
                <input
                  className="input text-sm"
                  required
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="Abebe Kebede"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Email (used to log in)</label>
                <input
                  type="email"
                  className="input text-sm"
                  required
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  placeholder="abebe@yourrestaurant.com"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Temporary password</label>
                <input
                  type="text"
                  className="input text-sm"
                  required
                  minLength={6}
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  placeholder="At least 6 characters"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Role</label>
                <select
                  className="input text-sm"
                  value={form.role}
                  onChange={e => setForm({ ...form, role: e.target.value as UserRole })}
                >
                  {ROLES.map(r => <option key={r} value={r} className="capitalize">{r}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Phone (optional)</label>
                  <input
                    className="input text-sm"
                    value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })}
                    placeholder="+251…"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Salary (optional)</label>
                  <input
                    type="number"
                    className="input text-sm"
                    value={form.salary}
                    onChange={e => setForm({ ...form, salary: e.target.value })}
                    placeholder="0"
                  />
                </div>
              </div>

              <button type="submit" disabled={saving} className="btn-primary w-full text-sm py-2.5 mt-2 disabled:opacity-50">
                {saving ? 'Adding…' : 'Add staff member'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}