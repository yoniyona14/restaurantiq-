'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, cn } from '@/lib/utils'
import { Supplier } from '@/types/enterprise'
import toast from 'react-hot-toast'
import { Plus, X, Search, Phone, Mail, Building2 } from 'lucide-react'

const PAYMENT_TERMS = ['net_7', 'net_15', 'net_30', 'net_60', 'cash_on_delivery', 'prepaid']

export default function SuppliersPage() {
  const supabase = createClient()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [restaurantId, setRestaurantId] = useState('')
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [form, setForm] = useState({
    name: '', contact_person: '', phone: '', email: '',
    address: '', tax_number: '', payment_terms: 'net_30', notes: ''
  })

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('users').select('restaurant_id').eq('id', user!.id).single()
    setRestaurantId(profile!.restaurant_id)

    const { data } = await supabase
      .from('suppliers')
      .select('*')
      .eq('restaurant_id', profile!.restaurant_id)
      .order('name')
    setSuppliers(data ?? [])
    setLoading(false)
  }

  function openCreate() {
    setEditing(null)
    setForm({ name: '', contact_person: '', phone: '', email: '', address: '', tax_number: '', payment_terms: 'net_30', notes: '' })
    setShowModal(true)
  }

  function openEdit(s: Supplier) {
    setEditing(s)
    setForm({
      name: s.name, contact_person: s.contact_person ?? '',
      phone: s.phone ?? '', email: s.email ?? '',
      address: s.address ?? '', tax_number: s.tax_number ?? '',
      payment_terms: s.payment_terms ?? 'net_30', notes: s.notes ?? ''
    })
    setShowModal(true)
  }

  async function save() {
    if (!form.name) { toast.error('Supplier name is required'); return }
    const payload = { restaurant_id: restaurantId, ...form, is_active: true }
    if (editing) {
      const { error } = await supabase.from('suppliers').update(payload).eq('id', editing.id)
      if (error) { toast.error(error.message); return }
      toast.success('Supplier updated')
    } else {
      const { error } = await supabase.from('suppliers').insert(payload)
      if (error) { toast.error(error.message); return }
      toast.success('Supplier added')
    }
    setShowModal(false)
    load()
  }

  async function toggleActive(s: Supplier) {
    await supabase.from('suppliers').update({ is_active: !s.is_active }).eq('id', s.id)
    load()
  }

  const filtered = suppliers.filter(s =>
    !search ||
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.contact_person ?? '').toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Loading suppliers…</div>

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Suppliers</h1>
          <p className="text-sm text-gray-500">{suppliers.filter(s => s.is_active).length} active suppliers</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus className="w-4 h-4" /> Add supplier
        </button>
      </div>

      <div className="relative w-64">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input className="input pl-9 text-sm" placeholder="Search suppliers…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(s => (
          <div key={s.id} className={cn('card p-5', !s.is_active && 'opacity-50')}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">{s.name}</p>
                  <p className="text-xs text-gray-400">{s.payment_terms?.replace('_', ' ')}</p>
                </div>
              </div>
              <span className={cn('badge', s.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500')}>
                {s.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>

            {s.contact_person && (
              <p className="text-sm text-gray-600 mb-1">👤 {s.contact_person}</p>
            )}
            {s.phone && (
              <p className="text-xs text-gray-400 flex items-center gap-1 mb-0.5">
                <Phone className="w-3 h-3" /> {s.phone}
              </p>
            )}
            {s.email && (
              <p className="text-xs text-gray-400 flex items-center gap-1 mb-0.5">
                <Mail className="w-3 h-3" /> {s.email}
              </p>
            )}

            <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100">
              <button onClick={() => openEdit(s)} className="btn-secondary flex-1 text-xs py-1.5">Edit</button>
              <button onClick={() => toggleActive(s)} className="btn-secondary flex-1 text-xs py-1.5">
                {s.is_active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-sm text-gray-400 col-span-full text-center py-12">No suppliers yet. Add your first supplier.</p>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">{editing ? 'Edit supplier' : 'Add supplier'}</h2>
              <button onClick={() => setShowModal(false)}><X className="w-4 h-4 text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Company name</label>
                <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Addis Food Distributors" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Contact person</label>
                  <input className="input" value={form.contact_person} onChange={e => setForm({ ...form, contact_person: e.target.value })} placeholder="Name" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Phone</label>
                  <input className="input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+251…" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Email</label>
                <input type="email" className="input" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="supplier@email.com" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Address</label>
                <input className="input" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Street, city" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Tax number</label>
                  <input className="input" value={form.tax_number} onChange={e => setForm({ ...form, tax_number: e.target.value })} placeholder="TIN" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Payment terms</label>
                  <select className="input" value={form.payment_terms} onChange={e => setForm({ ...form, payment_terms: e.target.value })}>
                    {PAYMENT_TERMS.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Notes</label>
                <textarea className="input" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Products supplied, special terms…" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={save} className="btn-primary flex-1">{editing ? 'Save changes' : 'Add supplier'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
