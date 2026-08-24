'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

export default function SettingsPage() {
  const supabase = createClient()
  const [restaurant, setRestaurant] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', address: '', phone: '' })

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase.from('users').select('*, restaurants(*)').eq('id', user!.id).single()
      const r = profile!.restaurants as any
      setRestaurant(r)
      setForm({ name: r.name ?? '', address: r.address ?? '', phone: r.phone ?? '' })
      setLoading(false)
    }
    load()
  }, [])

  async function save() {
    setSaving(true)
    await supabase.from('restaurants').update(form).eq('id', restaurant.id)
    toast.success('Settings saved')
    setSaving(false)
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Loading…</div>

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500">Manage your restaurant profile</p>
      </div>

      <div className="card p-6 space-y-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Restaurant name</label>
          <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Address</label>
          <input className="input" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="e.g. Bole, Addis Ababa" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Phone number</label>
          <input className="input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+251 9xx xxx xxx" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Menu URL (slug)</label>
          <div className="input bg-gray-50 text-gray-400 cursor-not-allowed">{restaurant.slug}</div>
          <p className="text-xs text-gray-400 mt-1">Your QR menu lives at /menu/{restaurant.slug}/[table-number]</p>
        </div>
        <div className="pt-2">
          <button onClick={save} disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      <div className="card p-6">
        <h2 className="font-medium text-gray-900 mb-1">Plan</h2>
        <p className="text-sm text-gray-500 mb-3">You're currently on the <span className="font-medium capitalize">{restaurant.plan}</span> plan.</p>
        <span className="badge bg-brand-100 text-brand-700 capitalize">{restaurant.plan}</span>
      </div>
    </div>
  )
}
