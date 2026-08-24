'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, cn } from '@/lib/utils'
import { PrepBatch } from '@/types/enterprise'
import { InventoryItem } from '@/types'
import toast from 'react-hot-toast'
import { Plus, X, Search, ArrowRight, ArrowLeft } from 'lucide-react'
import { useSearchParams, useRouter } from 'next/navigation'

export default function PrepBatchesPage() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [batches, setBatches] = useState<PrepBatch[]>([])
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [restaurantId, setRestaurantId] = useState('')
  const [userId, setUserId] = useState('')
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({
    inventory_id: '',
    date: new Date().toISOString().split('T')[0],
    raw_quantity: '',
    usable_quantity: '',
    notes: '',
  })
  const [fromProduction, setFromProduction] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  // Pre-fill form if coming from Production Planning
  useEffect(() => {
    const inv_id   = searchParams.get('inventory_id')
    const raw_qty  = searchParams.get('raw_quantity')
    const itemName = searchParams.get('name')
    if (inv_id) {
      setFromProduction(itemName)
      setForm(f => ({
        ...f,
        inventory_id: inv_id,
        raw_quantity: raw_qty ?? '',
        notes: itemName ? `Prep batch for ${itemName} — from production plan` : '',
      }))
      setShowModal(true)
    }
  }, [searchParams])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('users').select('restaurant_id').eq('id', user!.id).single()
    setRestaurantId(profile!.restaurant_id)
    setUserId(user!.id)

    const [{ data: batchData }, { data: inv }] = await Promise.all([
      supabase.from('prep_batches')
        .select('*, inventory_items(name, unit), users!prep_batches_performed_by_fkey(name)')
        .eq('restaurant_id', profile!.restaurant_id)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.from('inventory_items').select('*').eq('restaurant_id', profile!.restaurant_id).order('name'),
    ])
    setBatches((batchData as any) ?? [])
    setInventory(inv ?? [])
    setLoading(false)
  }

  const raw    = Number(form.raw_quantity) || 0
  const usable = Number(form.usable_quantity) || 0
  const waste  = Math.max(0, raw - usable)
  const yieldPct = raw > 0 ? Math.round((usable / raw) * 100) : 0

  async function saveBatch() {
    if (!form.inventory_id)   { toast.error('Select an ingredient'); return }
    if (raw <= 0)              { toast.error('Enter raw quantity'); return }
    if (usable <= 0)           { toast.error('Enter usable quantity'); return }
    if (usable > raw)          { toast.error('Usable cannot exceed raw'); return }

    const inv = inventory.find(i => i.id === form.inventory_id)!
    const batchNum = `BATCH-${Date.now().toString(36).toUpperCase()}`

    const { error } = await supabase.from('prep_batches').insert({
      restaurant_id: restaurantId,
      batch_number: batchNum,
      inventory_id: form.inventory_id,
      date: form.date,
      raw_quantity: raw,
      usable_quantity: usable,
      waste_quantity: waste,
      yield_percentage: yieldPct,
      performed_by: userId,
      notes: form.notes || null,
    })

    if (error) { toast.error(error.message); return }

    // Auto-deduct waste from inventory and record movement
    if (waste > 0) {
      const { data: invItem } = await supabase.from('inventory_items').select('current_stock').eq('id', form.inventory_id).single()
      if (invItem) {
        const stockBefore = invItem.current_stock
        const stockAfter  = Math.max(0, stockBefore - waste)
        await supabase.from('inventory_items').update({ current_stock: stockAfter, last_updated: new Date().toISOString() }).eq('id', form.inventory_id)
        await supabase.from('inventory_movements').insert({
          restaurant_id: restaurantId,
          inventory_id: form.inventory_id,
          reason: 'prep_production',
          quantity: -waste,
          stock_before: stockBefore,
          stock_after: stockAfter,
          reference_type: 'prep_batch',
          performed_by: userId,
          notes: `Prep waste: ${batchNum} — yield ${yieldPct}%`,
        })
      }
    }

    toast.success(`${batchNum} saved — ${waste > 0 ? `${waste.toFixed(2)} ${inv.unit} waste deducted from inventory` : 'no waste'}`)
    setShowModal(false)
    setFromProduction(null)
    setForm({ inventory_id: '', date: new Date().toISOString().split('T')[0], raw_quantity: '', usable_quantity: '', notes: '' })
    load()
    // Clear URL params
    router.replace('/dashboard/prep-batches')
  }

  const avgYield      = batches.length > 0 ? Math.round(batches.reduce((s, b) => s + b.yield_percentage, 0) / batches.length) : 0
  const totalWasteCost = batches.reduce((s, b) => {
    const inv = inventory.find(i => i.id === b.inventory_id)
    return s + b.waste_quantity * (inv?.unit_cost ?? 0)
  }, 0)

  const filtered = batches.filter(b =>
    !search || (b.inventory_item as any)?.name?.toLowerCase().includes(search.toLowerCase()) || b.batch_number.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Loading prep batches…</div>

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Prep Batches</h1>
          <p className="text-sm text-gray-500">Track production yield — waste auto-deducted from inventory</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/dashboard/production" className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Production plan
          </a>
          <button onClick={() => setShowModal(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> New batch
          </button>
        </div>
      </div>

      {/* Flow indicator */}
      <div className="flex items-center gap-2 text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
        <span className="font-medium text-blue-700">Flow:</span>
        <a href="/dashboard/production" className="bg-blue-100 text-blue-600 hover:text-blue-800 px-2 py-0.5 rounded font-medium">Production Planning</a>
        <ArrowRight className="w-3 h-3 text-blue-400" />
        <span className="bg-blue-600 text-white px-2 py-0.5 rounded font-medium">Prep Batches</span>
        <ArrowRight className="w-3 h-3 text-blue-400" />
        <a href="/dashboard/inventory" className="bg-blue-100 text-blue-600 hover:text-blue-800 px-2 py-0.5 rounded font-medium">Inventory</a>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="kpi-card"><span className="kpi-label">Batches recorded</span><p className="kpi-value">{batches.length}</p></div>
        <div className="kpi-card"><span className="kpi-label">Avg yield</span><p className={cn('kpi-value', avgYield < 80 ? 'text-amber-600' : 'text-gray-900')}>{avgYield}%</p></div>
        <div className="kpi-card"><span className="kpi-label">Total waste cost</span><p className="kpi-value text-red-500">{formatCurrency(totalWasteCost)}</p></div>
        <div className="kpi-card"><span className="kpi-label">Low yield batches</span><p className={cn('kpi-value', batches.filter(b => b.yield_percentage < 80).length > 0 && 'text-amber-600')}>{batches.filter(b => b.yield_percentage < 80).length}</p></div>
      </div>

      <div className="relative w-64">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input className="input pl-9 text-sm" placeholder="Search batches…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-xs text-gray-500 font-medium">
              <th className="text-left px-4 py-3">Batch #</th>
              <th className="text-left px-4 py-3">Ingredient</th>
              <th className="text-left px-4 py-3">Date</th>
              <th className="text-right px-4 py-3">Raw</th>
              <th className="text-right px-4 py-3">Usable</th>
              <th className="text-right px-4 py-3">Waste</th>
              <th className="text-right px-4 py-3">Yield</th>
              <th className="text-left px-4 py-3">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map(b => {
              const unit = (b.inventory_item as any)?.unit ?? ''
              return (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900 text-xs">{b.batch_number}</td>
                  <td className="px-4 py-3 text-gray-700">{(b.inventory_item as any)?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{new Date(b.date).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{b.raw_quantity} {unit}</td>
                  <td className="px-4 py-3 text-right text-emerald-600 font-medium">{b.usable_quantity} {unit}</td>
                  <td className="px-4 py-3 text-right text-red-500">{b.waste_quantity} {unit}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={cn('badge', b.yield_percentage < 80 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700')}>
                      {b.yield_percentage.toFixed(0)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 max-w-xs truncate">{b.notes || '—'}</td>
                </tr>
              )
            })}
            {filtered.length === 0 && <tr><td colSpan={8} className="text-center py-12 text-gray-400 text-sm">No batches yet</td></tr>}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => { setShowModal(false); router.replace('/dashboard/prep-batches') }}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-semibold text-gray-900">Record prep batch</h2>
              <button onClick={() => { setShowModal(false); router.replace('/dashboard/prep-batches') }}><X className="w-4 h-4 text-gray-400" /></button>
            </div>
            {fromProduction && (
              <p className="text-xs text-blue-600 bg-blue-50 rounded px-2 py-1 mb-3">
                Pre-filled from Production Plan: <strong>{fromProduction}</strong>
              </p>
            )}
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Ingredient</label>
                <select className="input" value={form.inventory_id} onChange={e => setForm({ ...form, inventory_id: e.target.value })}>
                  <option value="">Select ingredient…</option>
                  {inventory.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Date</label>
                <input type="date" className="input" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Raw quantity</label>
                  <input type="number" className="input" value={form.raw_quantity} onChange={e => setForm({ ...form, raw_quantity: e.target.value })} placeholder="e.g. 30" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Usable quantity</label>
                  <input type="number" className="input" value={form.usable_quantity} onChange={e => setForm({ ...form, usable_quantity: e.target.value })} placeholder="e.g. 27" />
                </div>
              </div>
              {raw > 0 && usable > 0 && (
                <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Waste (auto-deducted from inventory)</span>
                    <span className="text-red-500 font-medium">{waste.toFixed(2)} {inventory.find(i => i.id === form.inventory_id)?.unit ?? ''}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Yield</span>
                    <span className={cn('font-medium', yieldPct < 80 ? 'text-amber-600' : 'text-emerald-600')}>{yieldPct}%</span>
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Notes</label>
                <textarea className="input" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Reason for waste, technique used…" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => { setShowModal(false); router.replace('/dashboard/prep-batches') }} className="btn-secondary flex-1">Cancel</button>
              <button onClick={saveBatch} className="btn-primary flex-1">Record batch & update inventory</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
