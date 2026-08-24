'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, cn } from '@/lib/utils'
import { PurchaseOrder, PurchaseOrderItem, POStatus, Supplier } from '@/types/enterprise'
import { InventoryItem } from '@/types'
import toast from 'react-hot-toast'
import { Plus, X, Search, ChevronRight, CheckCircle2, Truck, FileText, XCircle } from 'lucide-react'

const STATUS_STYLES: Record<POStatus, string> = {
  draft:     'bg-gray-100 text-gray-600',
  submitted: 'bg-blue-100 text-blue-700',
  approved:  'bg-purple-100 text-purple-700',
  received:  'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-600',
}

const STATUS_FLOW: POStatus[] = ['draft', 'submitted', 'approved', 'received']

export default function PurchasingPage() {
  const supabase = createClient()
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [restaurantId, setRestaurantId] = useState('')
  const [userId, setUserId] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<PurchaseOrder | null>(null)
  const [showModal, setShowModal] = useState(false)

  // Form
  const [form, setForm] = useState({
    supplier_id: '',
    expected_delivery: '',
    notes: '',
    shipping: '0',
    discount: '0',
  })
  const [lineItems, setLineItems] = useState<Partial<PurchaseOrderItem>[]>([
    { item_name: '', quantity_ordered: 0, quantity_received: 0, unit: 'kg', unit_cost: 0, tax_rate: 0, discount: 0, total: 0 }
  ])

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('users').select('restaurant_id').eq('id', user!.id).single()
    setRestaurantId(profile!.restaurant_id)
    setUserId(user!.id)

    const [{ data: pos }, { data: sups }, { data: inv }] = await Promise.all([
      supabase.from('purchase_orders')
        .select('*, suppliers(name), users!purchase_orders_created_by_fkey(name), purchase_order_items(*, inventory_items(name))')
        .eq('restaurant_id', profile!.restaurant_id)
        .order('created_at', { ascending: false }),
      supabase.from('suppliers').select('*').eq('restaurant_id', profile!.restaurant_id).eq('is_active', true),
      supabase.from('inventory_items').select('*').eq('restaurant_id', profile!.restaurant_id).order('name'),
    ])
    setOrders((pos as any) ?? [])
    setSuppliers(sups ?? [])
    setInventory(inv ?? [])
    setLoading(false)
  }

  function addLine() {
    setLineItems([...lineItems, { item_name: '', quantity_ordered: 0, quantity_received: 0, unit: 'kg', unit_cost: 0, tax_rate: 0, discount: 0, total: 0 }])
  }

  function removeLine(i: number) {
    setLineItems(lineItems.filter((_, idx) => idx !== i))
  }

  function updateLine(i: number, field: string, value: any) {
    const updated = [...lineItems]
    updated[i] = { ...updated[i], [field]: value }
    // Auto-pick inventory item details
    if (field === 'inventory_id') {
      const inv = inventory.find(item => item.id === value)
      if (inv) {
        updated[i].item_name = inv.name
        updated[i].unit = inv.unit
        updated[i].unit_cost = inv.unit_cost
      }
    }
    // Recalculate total
    const qty = Number(updated[i].quantity_ordered) || 0
    const cost = Number(updated[i].unit_cost) || 0
    const tax = Number(updated[i].tax_rate) || 0
    const disc = Number(updated[i].discount) || 0
    updated[i].total = (qty * cost * (1 + tax / 100)) - disc
    setLineItems(updated)
  }

  const subtotal = lineItems.reduce((s, l) => s + (Number(l.quantity_ordered) * Number(l.unit_cost)), 0)
  const tax = lineItems.reduce((s, l) => s + (Number(l.quantity_ordered) * Number(l.unit_cost) * (Number(l.tax_rate) / 100)), 0)
  const total = subtotal + tax - Number(form.discount) + Number(form.shipping)

  async function createPO() {
    if (lineItems.length === 0 || !lineItems[0].item_name) {
      toast.error('Add at least one item')
      return
    }

    // Generate PO number
    const { data: poNum } = await supabase.rpc('generate_po_number', { p_restaurant_id: restaurantId })

    const { data: po, error } = await supabase.from('purchase_orders').insert({
      restaurant_id: restaurantId,
      supplier_id: form.supplier_id || null,
      po_number: poNum,
      status: 'draft',
      expected_delivery: form.expected_delivery || null,
      subtotal,
      tax,
      discount: Number(form.discount),
      shipping: Number(form.shipping),
      total,
      notes: form.notes || null,
      created_by: userId,
    }).select().single()

    if (error || !po) { toast.error(error?.message ?? 'Failed to create PO'); return }

    const { error: itemsError } = await supabase.from('purchase_order_items').insert(
      lineItems.map(l => ({
        purchase_order_id: po.id,
        inventory_id: l.inventory_id || null,
        item_name: l.item_name,
        quantity_ordered: Number(l.quantity_ordered),
        quantity_received: 0,
        unit: l.unit,
        unit_cost: Number(l.unit_cost),
        tax_rate: Number(l.tax_rate),
        discount: Number(l.discount),
        total: Number(l.total),
      }))
    )

    if (itemsError) { toast.error(itemsError.message); return }

    toast.success(`Purchase order ${poNum} created`)
    setShowModal(false)
    load()
  }

  async function advanceStatus(po: PurchaseOrder) {
    const currentIdx = STATUS_FLOW.indexOf(po.status)
    if (currentIdx >= STATUS_FLOW.length - 1) return
    const nextStatus = STATUS_FLOW[currentIdx + 1]

    const updatePayload: any = { status: nextStatus, updated_at: new Date().toISOString() }
    if (nextStatus === 'received') updatePayload.received_at = new Date().toISOString()

    const { error } = await supabase.from('purchase_orders').update(updatePayload).eq('id', po.id)
    if (error) { toast.error(error.message); return }

    // When received — update inventory and record movements
    if (nextStatus === 'received') {
      for (const item of (po.items ?? [])) {
        if (!item.inventory_id) continue
        const qty = item.quantity_received || item.quantity_ordered
        const { data: inv } = await supabase.from('inventory_items').select('current_stock').eq('id', item.inventory_id).single()
        if (!inv) continue
        const stockBefore = inv.current_stock
        const stockAfter = stockBefore + qty
        await supabase.from('inventory_items').update({
          current_stock: stockAfter,
          unit_cost: item.unit_cost,
          last_updated: new Date().toISOString()
        }).eq('id', item.inventory_id)

        await supabase.from('inventory_movements').insert({
          restaurant_id: restaurantId,
          inventory_id: item.inventory_id,
          reason: 'purchase',
          quantity: qty,
          unit_cost: item.unit_cost,
          total_cost: qty * item.unit_cost,
          stock_before: stockBefore,
          stock_after: stockAfter,
          reference_id: po.id,
          reference_type: 'purchase_order',
          performed_by: userId,
          notes: `Received via ${po.po_number}`,
        })
      }
      toast.success('Inventory updated from purchase order')
    } else {
      toast.success(`Status → ${nextStatus}`)
    }

    setSelected(null)
    load()
  }

  async function cancelPO(po: PurchaseOrder) {
    if (!confirm('Cancel this purchase order?')) return
    await supabase.from('purchase_orders').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', po.id)
    toast.success('Purchase order cancelled')
    setSelected(null)
    load()
  }

  const filtered = orders.filter(o =>
    !search ||
    o.po_number.toLowerCase().includes(search.toLowerCase()) ||
    (o.supplier as any)?.name?.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Loading purchasing…</div>

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Purchase Orders</h1>
          <p className="text-sm text-gray-500">Full purchasing workflow — draft to received</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> New order
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {(['draft','submitted','approved','received'] as POStatus[]).map(s => (
          <div key={s} className="kpi-card">
            <span className="kpi-label capitalize">{s}</span>
            <p className="kpi-value">{orders.filter(o => o.status === s).length}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative w-64">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input className="input pl-9 text-sm" placeholder="Search PO or supplier…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Orders table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-xs text-gray-500 font-medium">
              <th className="text-left px-4 py-3">PO Number</th>
              <th className="text-left px-4 py-3">Supplier</th>
              <th className="text-left px-4 py-3">Expected</th>
              <th className="text-right px-4 py-3">Total</th>
              <th className="text-right px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Created</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map(po => (
              <tr key={po.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelected(po)}>
                <td className="px-4 py-3 font-medium text-gray-900">{po.po_number}</td>
                <td className="px-4 py-3 text-gray-600">{(po.supplier as any)?.name ?? '—'}</td>
                <td className="px-4 py-3 text-gray-400">{po.expected_delivery ? new Date(po.expected_delivery).toLocaleDateString() : '—'}</td>
                <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency(po.total)}</td>
                <td className="px-4 py-3 text-right">
                  <span className={cn('badge capitalize', STATUS_STYLES[po.status])}>{po.status}</span>
                </td>
                <td className="px-4 py-3 text-right text-xs text-gray-400">{new Date(po.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right"><ChevronRight className="w-4 h-4 text-gray-300 ml-auto" /></td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="text-center py-12 text-gray-400 text-sm">No purchase orders yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Detail drawer */}
      {selected && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-end z-50" onClick={() => setSelected(null)}>
          <div className="bg-white h-full w-full max-w-lg shadow-xl p-6 overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-gray-900">{selected.po_number}</h2>
                <span className={cn('badge capitalize mt-1', STATUS_STYLES[selected.status])}>{selected.status}</span>
              </div>
              <button onClick={() => setSelected(null)}><X className="w-4 h-4 text-gray-400" /></button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
              <div><p className="text-xs text-gray-400">Supplier</p><p className="text-gray-900">{(selected.supplier as any)?.name ?? '—'}</p></div>
              <div><p className="text-xs text-gray-400">Expected delivery</p><p className="text-gray-900">{selected.expected_delivery ? new Date(selected.expected_delivery).toLocaleDateString() : '—'}</p></div>
              {selected.received_at && <div><p className="text-xs text-gray-400">Received</p><p className="text-gray-900">{new Date(selected.received_at).toLocaleDateString()}</p></div>}
            </div>

            <div className="border-t border-gray-100 pt-3 mb-4">
              <p className="text-xs text-gray-400 mb-2">Items</p>
              <table className="w-full text-sm">
                <thead><tr className="text-xs text-gray-400"><th className="text-left py-1">Item</th><th className="text-right py-1">Qty</th><th className="text-right py-1">Cost</th><th className="text-right py-1">Total</th></tr></thead>
                <tbody>
                  {(selected.items ?? []).map((item, i) => (
                    <tr key={i} className="border-t border-gray-50">
                      <td className="py-1.5 text-gray-700">{item.item_name}</td>
                      <td className="py-1.5 text-right text-gray-500">{item.quantity_ordered} {item.unit}</td>
                      <td className="py-1.5 text-right text-gray-500">{formatCurrency(item.unit_cost)}</td>
                      <td className="py-1.5 text-right font-medium">{formatCurrency(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-gray-50 rounded-lg p-3 space-y-1 mb-4 text-sm">
              <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{formatCurrency(selected.subtotal)}</span></div>
              <div className="flex justify-between text-gray-500"><span>Tax</span><span>{formatCurrency(selected.tax)}</span></div>
              {selected.discount > 0 && <div className="flex justify-between text-red-500"><span>Discount</span><span>- {formatCurrency(selected.discount)}</span></div>}
              {selected.shipping > 0 && <div className="flex justify-between text-gray-500"><span>Shipping</span><span>{formatCurrency(selected.shipping)}</span></div>}
              <div className="flex justify-between font-semibold text-gray-900 border-t border-gray-200 pt-1"><span>Total</span><span>{formatCurrency(selected.total)}</span></div>
            </div>

            {selected.notes && <p className="text-sm text-gray-500 mb-4">{selected.notes}</p>}

            {/* Actions */}
            <div className="space-y-2">
              {selected.status !== 'received' && selected.status !== 'cancelled' && (
                <button onClick={() => advanceStatus(selected)} className="btn-primary w-full text-sm py-2.5">
                  {selected.status === 'approved' ? (
                    <><Truck className="w-4 h-4" /> Mark as Received & Update Inventory</>
                  ) : (
                    <><CheckCircle2 className="w-4 h-4" /> Advance to {STATUS_FLOW[STATUS_FLOW.indexOf(selected.status) + 1]}</>
                  )}
                </button>
              )}
              {selected.status !== 'received' && selected.status !== 'cancelled' && (
                <button onClick={() => cancelPO(selected)} className="btn-secondary w-full text-sm py-2 text-red-500 hover:bg-red-50">
                  <XCircle className="w-4 h-4" /> Cancel order
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create PO Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">New Purchase Order</h2>
              <button onClick={() => setShowModal(false)}><X className="w-4 h-4 text-gray-400" /></button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Supplier</label>
                <select className="input" value={form.supplier_id} onChange={e => setForm({ ...form, supplier_id: e.target.value })}>
                  <option value="">— No supplier —</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Expected delivery</label>
                <input type="date" className="input" value={form.expected_delivery} onChange={e => setForm({ ...form, expected_delivery: e.target.value })} />
              </div>
            </div>

            {/* Line items */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-500 font-medium">Items</p>
                <button onClick={addLine} className="text-xs text-brand-600 hover:underline">+ Add line</button>
              </div>
              <div className="space-y-2">
                {lineItems.map((line, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-3">
                      <label className="block text-xs text-gray-400 mb-1">Ingredient</label>
                      <select className="input text-xs py-1.5" value={line.inventory_id ?? ''} onChange={e => updateLine(i, 'inventory_id', e.target.value)}>
                        <option value="">— Custom —</option>
                        {inventory.map(inv => <option key={inv.id} value={inv.id}>{inv.name}</option>)}
                      </select>
                    </div>
                    <div className="col-span-3">
                      <label className="block text-xs text-gray-400 mb-1">Name</label>
                      <input className="input text-xs py-1.5" value={line.item_name} onChange={e => updateLine(i, 'item_name', e.target.value)} placeholder="Item name" />
                    </div>
                    <div className="col-span-1">
                      <label className="block text-xs text-gray-400 mb-1">Qty</label>
                      <input type="number" className="input text-xs py-1.5" value={line.quantity_ordered || ''} onChange={e => updateLine(i, 'quantity_ordered', e.target.value)} placeholder="0" />
                    </div>
                    <div className="col-span-1">
                      <label className="block text-xs text-gray-400 mb-1">Unit</label>
                      <input className="input text-xs py-1.5" value={line.unit} onChange={e => updateLine(i, 'unit', e.target.value)} />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-gray-400 mb-1">Unit cost</label>
                      <input type="number" className="input text-xs py-1.5" value={line.unit_cost || ''} onChange={e => updateLine(i, 'unit_cost', e.target.value)} placeholder="0.00" />
                    </div>
                    <div className="col-span-1">
                      <label className="block text-xs text-gray-400 mb-1">Total</label>
                      <p className="text-xs font-medium text-gray-700 py-2">{formatCurrency(line.total ?? 0)}</p>
                    </div>
                    <div className="col-span-1">
                      <button onClick={() => removeLine(i)} className="text-red-400 hover:text-red-600 py-2">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Discount (ETB)</label>
                <input type="number" className="input" value={form.discount} onChange={e => setForm({ ...form, discount: e.target.value })} placeholder="0" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Shipping (ETB)</label>
                <input type="number" className="input" value={form.shipping} onChange={e => setForm({ ...form, shipping: e.target.value })} placeholder="0" />
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-xs text-gray-500 mb-1">Notes</label>
              <textarea className="input" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Delivery instructions, special requirements…" />
            </div>

            <div className="bg-gray-50 rounded-lg p-3 text-sm mb-4 space-y-1">
              <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
              <div className="flex justify-between text-gray-500"><span>Tax</span><span>{formatCurrency(tax)}</span></div>
              <div className="flex justify-between font-semibold text-gray-900 border-t border-gray-200 pt-1"><span>Total</span><span>{formatCurrency(total)}</span></div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={createPO} className="btn-primary flex-1">Create purchase order</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
