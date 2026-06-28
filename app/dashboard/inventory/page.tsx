'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, cn, formatDate } from '@/lib/utils'
import { InventoryItem } from '@/types'
import toast from 'react-hot-toast'
import { Plus, AlertTriangle, X, TrendingDown, TrendingUp } from 'lucide-react'

export default function InventoryPage() {
  const supabase = createClient()
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<InventoryItem | null>(null)
  const [restaurantId, setRestaurantId] = useState('')
  const [form, setForm] = useState({ name: '', unit: 'kg', current_stock: '', reorder_level: '', unit_cost: '' })

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('users').select('restaurant_id').eq('id', user!.id).single()
    setRestaurantId(profile!.restaurant_id)
    const { data } = await supabase.from('inventory_items').select('*').eq('restaurant_id', profile!.restaurant_id).order('name')
    setItems(data ?? [])
    setLoading(false)
  }

  function openCreate() {
    setEditing(null)
    setForm({ name: '', unit: 'kg', current_stock: '', reorder_level: '', unit_cost: '' })
    setShowModal(true)
  }

  function openEdit(item: InventoryItem) {
    setEditing(item)
    setForm({ name: item.name, unit: item.unit, current_stock: String(item.current_stock), reorder_level: String(item.reorder_level), unit_cost: String(item.unit_cost) })
    setShowModal(true)
  }

  async function save() {
    const payload = {
      restaurant_id: restaurantId,
      name: form.name,
      unit: form.unit,
      current_stock: Number(form.current_stock),
      reorder_level: Number(form.reorder_level),
      unit_cost: Number(form.unit_cost),
      last_updated: new Date().toISOString(),
    }
    if (editing) {
      await supabase.from('inventory_items').update(payload).eq('id', editing.id)
      toast.success('Inventory item updated')
    } else {
      await supabase.from('inventory_items').insert(payload)
      toast.success('Inventory item added')
    }
    setShowModal(false)
    load()
  }

  async function adjustStock(item: InventoryItem, delta: number) {
    const newStock = Math.max(0, item.current_stock + delta)
    await supabase.from('inventory_items').update({ current_stock: newStock, last_updated: new Date().toISOString() }).eq('id', item.id)
    await supabase.from('inventory_transactions').insert({
      inventory_id: item.id,
      type: delta > 0 ? 'purchase' : 'usage',
      quantity: Math.abs(delta),
      unit_cost: item.unit_cost,
    })
    load()
  }

  const totalValue = items.reduce((s, i) => s + i.current_stock * i.unit_cost, 0)
  const lowStockItems = items.filter(i => i.current_stock <= i.reorder_level)

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Loading inventory…</div>

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Inventory</h1>
          <p className="text-sm text-gray-500">Track stock levels and ingredient usage</p>
        </div>
        <button onClick={openCreate} className="btn-primary"><Plus className="w-4 h-4" /> Add ingredient</button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="kpi-card">
          <span className="kpi-label">Total inventory value</span>
          <p className="kpi-value">{formatCurrency(totalValue)}</p>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Tracked ingredients</span>
          <p className="kpi-value">{items.length}</p>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Low stock alerts</span>
          <p className={cn('kpi-value', lowStockItems.length > 0 && 'text-amber-600')}>{lowStockItems.length}</p>
        </div>
      </div>

      {/* Low stock banner */}
      {lowStockItems.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">Low stock warning</p>
            <p className="text-xs text-amber-700 mt-1">
              {lowStockItems.map(i => i.name).join(', ')} {lowStockItems.length === 1 ? 'is' : 'are'} below reorder level.
            </p>
          </div>
        </div>
      )}

      {/* Inventory table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-xs text-gray-500 font-medium">
              <th className="text-left px-4 py-3">Ingredient</th>
              <th className="text-right px-4 py-3">Current stock</th>
              <th className="text-right px-4 py-3">Reorder level</th>
              <th className="text-right px-4 py-3">Unit cost</th>
              <th className="text-right px-4 py-3">Value</th>
              <th className="text-right px-4 py-3">Status</th>
              <th className="text-center px-4 py-3">Quick adjust</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {items.map(item => {
              const isLow = item.current_stock <= item.reorder_level
              return (
                <tr key={item.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openEdit(item)}>
                  <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{item.current_stock} {item.unit}</td>
                  <td className="px-4 py-3 text-right text-gray-400">{item.reorder_level} {item.unit}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{formatCurrency(item.unit_cost)}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(item.current_stock * item.unit_cost)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={cn('badge', isLow ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700')}>
                      {isLow ? 'Low stock' : 'In stock'}
                    </span>
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1.5">
                      <button onClick={() => adjustStock(item, -1)} className="w-7 h-7 rounded-md bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100">
                        <TrendingDown className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => adjustStock(item, 1)} className="w-7 h-7 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-100">
                        <TrendingUp className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {items.length === 0 && (
              <tr><td colSpan={7} className="text-center py-12 text-gray-400 text-sm">No ingredients tracked yet. Click "Add ingredient" to start.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">{editing ? 'Edit ingredient' : 'Add ingredient'}</h2>
              <button onClick={() => setShowModal(false)}><X className="w-4 h-4 text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Name</label>
                <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Tomatoes" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Unit</label>
                  <select className="input" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                    <option value="l">liters</option>
                    <option value="ml">ml</option>
                    <option value="pcs">pieces</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Unit cost (ETB)</label>
                  <input type="number" className="input" value={form.unit_cost} onChange={e => setForm({ ...form, unit_cost: e.target.value })} placeholder="0.00" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Current stock</label>
                  <input type="number" className="input" value={form.current_stock} onChange={e => setForm({ ...form, current_stock: e.target.value })} placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Reorder level</label>
                  <input type="number" className="input" value={form.reorder_level} onChange={e => setForm({ ...form, reorder_level: e.target.value })} placeholder="0" />
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={save} className="btn-primary flex-1">{editing ? 'Save changes' : 'Add ingredient'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
