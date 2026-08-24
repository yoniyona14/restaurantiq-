'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, cn } from '@/lib/utils'
import { InventoryItem } from '@/types'
import { InventoryMovement, MovementReason, MOVEMENT_REASONS } from '@/types/enterprise'
import toast from 'react-hot-toast'
import {
  Plus, AlertTriangle, X, Search, History,
  TrendingDown, TrendingUp, Package, ChevronDown
} from 'lucide-react'

const UNITS = ['kg', 'g', 'l', 'ml', 'pcs', 'box', 'bag', 'bottle', 'can', 'dozen']

export default function InventoryPage() {
  const supabase = createClient()
  const [items, setItems] = useState<InventoryItem[]>([])
  const [movements, setMovements] = useState<InventoryMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [restaurantId, setRestaurantId] = useState('')
  const [userId, setUserId] = useState('')
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'stock' | 'movements'>('stock')

  // Item modal
  const [showItemModal, setShowItemModal] = useState(false)
  const [editing, setEditing] = useState<InventoryItem | null>(null)
  const [itemForm, setItemForm] = useState({
    name: '', unit: 'kg', current_stock: '',
    reorder_level: '', unit_cost: '', category: '', notes: ''
  })

  // Movement modal
  const [showMovementModal, setShowMovementModal] = useState(false)
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)
  const [movementForm, setMovementForm] = useState({
    reason: 'purchase' as MovementReason,
    quantity: '',
    unit_cost: '',
    notes: ''
  })

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('users').select('restaurant_id').eq('id', user!.id).single()
    setRestaurantId(profile!.restaurant_id)
    setUserId(user!.id)

    const [{ data: inv }, { data: mov }] = await Promise.all([
      supabase.from('inventory_items').select('*').eq('restaurant_id', profile!.restaurant_id).order('name'),
      supabase.from('inventory_movements')
        .select('*, inventory_items(name, unit), users(name)')
        .eq('restaurant_id', profile!.restaurant_id)
        .order('recorded_at', { ascending: false })
        .limit(200)
    ])
    setItems(inv ?? [])
    setMovements((mov as any) ?? [])
    setLoading(false)
  }

  function openCreate() {
    setEditing(null)
    setItemForm({ name: '', unit: 'kg', current_stock: '', reorder_level: '', unit_cost: '', category: '', notes: '' })
    setShowItemModal(true)
  }

  function openEdit(item: InventoryItem) {
    setEditing(item)
    setItemForm({
      name: item.name, unit: item.unit,
      current_stock: String(item.current_stock),
      reorder_level: String(item.reorder_level),
      unit_cost: String(item.unit_cost),
      category: item.category ?? '',
      notes: (item as any).notes ?? ''
    })
    setShowItemModal(true)
  }

  function openMovement(item: InventoryItem) {
    setSelectedItem(item)
    setMovementForm({ reason: 'purchase', quantity: '', unit_cost: String(item.unit_cost), notes: '' })
    setShowMovementModal(true)
  }

  async function saveItem() {
    if (!itemForm.name) { toast.error('Name is required'); return }
    const payload = {
      restaurant_id: restaurantId,
      name: itemForm.name,
      unit: itemForm.unit,
      current_stock: Number(itemForm.current_stock) || 0,
      reorder_level: Number(itemForm.reorder_level) || 0,
      unit_cost: Number(itemForm.unit_cost) || 0,
      category: itemForm.category || null,
      notes: itemForm.notes || null,
      last_updated: new Date().toISOString(),
    }
    if (editing) {
      const { error } = await supabase.from('inventory_items').update(payload).eq('id', editing.id)
      if (error) { toast.error(error.message); return }
      toast.success('Updated')
    } else {
      const { error } = await supabase.from('inventory_items').insert(payload)
      if (error) { toast.error(error.message); return }
      toast.success('Ingredient added')
    }
    setShowItemModal(false)
    load()
  }

  async function recordMovement() {
    if (!selectedItem) return
    if (!movementForm.quantity || Number(movementForm.quantity) <= 0) {
      toast.error('Enter a valid quantity')
      return
    }

    const reasonDef = MOVEMENT_REASONS.find(r => r.value === movementForm.reason)!
    const signedQty = reasonDef.sign * Number(movementForm.quantity)
    const stockBefore = selectedItem.current_stock
    const stockAfter = Math.max(0, stockBefore + signedQty)
    const unitCost = Number(movementForm.unit_cost) || selectedItem.unit_cost
    const totalCost = Math.abs(signedQty) * unitCost

    // Update inventory
    const { error: stockError } = await supabase
      .from('inventory_items')
      .update({ current_stock: stockAfter, unit_cost: unitCost, last_updated: new Date().toISOString() })
      .eq('id', selectedItem.id)

    if (stockError) { toast.error(stockError.message); return }

    // Record movement
    const { error: movError } = await supabase.from('inventory_movements').insert({
      restaurant_id: restaurantId,
      inventory_id: selectedItem.id,
      reason: movementForm.reason,
      quantity: signedQty,
      unit_cost: unitCost,
      total_cost: totalCost,
      stock_before: stockBefore,
      stock_after: stockAfter,
      performed_by: userId,
      notes: movementForm.notes || null,
    })

    if (movError) { toast.error(movError.message); return }

    toast.success(`Movement recorded — stock: ${stockBefore} → ${stockAfter} ${selectedItem.unit}`)
    setShowMovementModal(false)
    load()
  }

  const totalValue = items.reduce((s, i) => s + i.current_stock * i.unit_cost, 0)
  const lowStock = items.filter(i => i.current_stock <= i.reorder_level)
  const filteredItems = items.filter(i =>
    !search || i.name.toLowerCase().includes(search.toLowerCase()) || (i.category ?? '').toLowerCase().includes(search.toLowerCase())
  )
  const filteredMovements = movements.filter(m =>
    !search || (m.inventory_item as any)?.name?.toLowerCase().includes(search.toLowerCase()) ||
    m.reason.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Loading inventory…</div>

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Inventory & F&B Control</h1>
          <p className="text-sm text-gray-500">Full traceability — every gram accounted for</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus className="w-4 h-4" /> Add ingredient
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="kpi-card">
          <span className="kpi-label">Inventory value</span>
          <p className="kpi-value">{formatCurrency(totalValue)}</p>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Ingredients tracked</span>
          <p className="kpi-value">{items.length}</p>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Low stock alerts</span>
          <p className={cn('kpi-value', lowStock.length > 0 && 'text-amber-600')}>{lowStock.length}</p>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Movements today</span>
          <p className="kpi-value">
            {movements.filter(m => new Date(m.recorded_at).toDateString() === new Date().toDateString()).length}
          </p>
        </div>
      </div>

      {/* Low stock alert */}
      {lowStock.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">Low stock warning</p>
            <p className="text-xs text-amber-700 mt-1">{lowStock.map(i => i.name).join(', ')} below reorder level</p>
          </div>
        </div>
      )}

      {/* Tabs + search */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1">
          <button
            onClick={() => setTab('stock')}
            className={cn('px-4 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5',
              tab === 'stock' ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            )}
          >
            <Package className="w-3.5 h-3.5" /> Stock levels
          </button>
          <button
            onClick={() => setTab('movements')}
            className={cn('px-4 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5',
              tab === 'movements' ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            )}
          >
            <History className="w-3.5 h-3.5" /> Movement log
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="input pl-9 text-sm w-56"
            placeholder="Search…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Stock levels tab */}
      {tab === 'stock' && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-xs text-gray-500 font-medium">
                <th className="text-left px-4 py-3">Ingredient</th>
                <th className="text-left px-4 py-3">Category</th>
                <th className="text-right px-4 py-3">Stock</th>
                <th className="text-right px-4 py-3">Reorder at</th>
                <th className="text-right px-4 py-3">Unit cost</th>
                <th className="text-right px-4 py-3">Value</th>
                <th className="text-right px-4 py-3">Status</th>
                <th className="text-center px-4 py-3">Record movement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredItems.map(item => {
                const isLow = item.current_stock <= item.reorder_level
                return (
                  <tr key={item.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openEdit(item)}>
                    <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs capitalize">{item.category || '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-700 font-medium">{item.current_stock} {item.unit}</td>
                    <td className="px-4 py-3 text-right text-gray-400">{item.reorder_level} {item.unit}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{formatCurrency(item.unit_cost)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(item.current_stock * item.unit_cost)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn('badge', isLow ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700')}>
                        {isLow ? 'Low' : 'OK'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => openMovement(item)}
                        className="btn-secondary text-xs py-1 px-3"
                      >
                        + Movement
                      </button>
                    </td>
                  </tr>
                )
              })}
              {filteredItems.length === 0 && (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400 text-sm">No ingredients found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Movement log tab */}
      {tab === 'movements' && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-xs text-gray-500 font-medium">
                <th className="text-left px-4 py-3">Date & time</th>
                <th className="text-left px-4 py-3">Ingredient</th>
                <th className="text-left px-4 py-3">Reason</th>
                <th className="text-right px-4 py-3">Quantity</th>
                <th className="text-right px-4 py-3">Before</th>
                <th className="text-right px-4 py-3">After</th>
                <th className="text-right px-4 py-3">Cost</th>
                <th className="text-left px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredMovements.map(m => {
                const isIn = m.quantity > 0
                const unit = (m.inventory_item as any)?.unit ?? ''
                return (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                      {new Date(m.recorded_at).toLocaleDateString()} {new Date(m.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">{(m.inventory_item as any)?.name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={cn('badge capitalize', isIn ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700')}>
                        {MOVEMENT_REASONS.find(r => r.value === m.reason)?.label ?? m.reason}
                      </span>
                    </td>
                    <td className={cn('px-4 py-3 text-right font-medium', isIn ? 'text-emerald-600' : 'text-red-500')}>
                      {isIn ? '+' : ''}{m.quantity} {unit}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400">{m.stock_before} {unit}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{m.stock_after} {unit}</td>
                    <td className="px-4 py-3 text-right text-gray-500">
                      {m.total_cost ? formatCurrency(m.total_cost) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 max-w-xs truncate">{m.notes || '—'}</td>
                  </tr>
                )
              })}
              {filteredMovements.length === 0 && (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400 text-sm">No movements recorded yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Item Modal */}
      {showItemModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setShowItemModal(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">{editing ? 'Edit ingredient' : 'Add ingredient'}</h2>
              <button onClick={() => setShowItemModal(false)}><X className="w-4 h-4 text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Name</label>
                <input className="input" value={itemForm.name} onChange={e => setItemForm({ ...itemForm, name: e.target.value })} placeholder="e.g. Chicken Breast" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Unit</label>
                  <select className="input" value={itemForm.unit} onChange={e => setItemForm({ ...itemForm, unit: e.target.value })}>
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Category</label>
                  <input className="input" value={itemForm.category} onChange={e => setItemForm({ ...itemForm, category: e.target.value })} placeholder="e.g. Meat, Produce" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Current stock</label>
                  <input type="number" className="input" value={itemForm.current_stock} onChange={e => setItemForm({ ...itemForm, current_stock: e.target.value })} placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Reorder level</label>
                  <input type="number" className="input" value={itemForm.reorder_level} onChange={e => setItemForm({ ...itemForm, reorder_level: e.target.value })} placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Unit cost (ETB)</label>
                  <input type="number" className="input" value={itemForm.unit_cost} onChange={e => setItemForm({ ...itemForm, unit_cost: e.target.value })} placeholder="0.00" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Notes</label>
                <textarea className="input" rows={2} value={itemForm.notes} onChange={e => setItemForm({ ...itemForm, notes: e.target.value })} placeholder="Storage location, handling notes…" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowItemModal(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={saveItem} className="btn-primary flex-1">{editing ? 'Save changes' : 'Add ingredient'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Record Movement Modal */}
      {showMovementModal && selectedItem && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setShowMovementModal(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-semibold text-gray-900">Record movement</h2>
              <button onClick={() => setShowMovementModal(false)}><X className="w-4 h-4 text-gray-400" /></button>
            </div>
            <p className="text-sm text-gray-500 mb-4">{selectedItem.name} · current stock: <span className="font-medium text-gray-900">{selectedItem.current_stock} {selectedItem.unit}</span></p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Reason</label>
                <select
                  className="input"
                  value={movementForm.reason}
                  onChange={e => setMovementForm({ ...movementForm, reason: e.target.value as MovementReason })}
                >
                  {MOVEMENT_REASONS.map(r => (
                    <option key={r.value} value={r.value}>{r.label} ({r.sign > 0 ? '+' : '-'})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Quantity ({selectedItem.unit})</label>
                  <input
                    type="number"
                    className="input"
                    value={movementForm.quantity}
                    onChange={e => setMovementForm({ ...movementForm, quantity: e.target.value })}
                    placeholder="0"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Unit cost (ETB)</label>
                  <input
                    type="number"
                    className="input"
                    value={movementForm.unit_cost}
                    onChange={e => setMovementForm({ ...movementForm, unit_cost: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Preview */}
              {movementForm.quantity && Number(movementForm.quantity) > 0 && (
                <div className="bg-gray-50 rounded-lg p-3 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Stock after:</span>
                    <span className="font-medium">
                      {Math.max(0, selectedItem.current_stock + (MOVEMENT_REASONS.find(r => r.value === movementForm.reason)?.sign ?? 1) * Number(movementForm.quantity))} {selectedItem.unit}
                    </span>
                  </div>
                  {movementForm.unit_cost && (
                    <div className="flex justify-between text-gray-600 mt-1">
                      <span>Total cost:</span>
                      <span className="font-medium">{formatCurrency(Number(movementForm.quantity) * Number(movementForm.unit_cost))}</span>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs text-gray-500 mb-1">Notes</label>
                <textarea
                  className="input"
                  rows={2}
                  value={movementForm.notes}
                  onChange={e => setMovementForm({ ...movementForm, notes: e.target.value })}
                  placeholder="Supplier name, reason for waste, etc."
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowMovementModal(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={recordMovement} className="btn-primary flex-1">Record movement</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
