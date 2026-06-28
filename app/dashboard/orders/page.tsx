'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate, cn, STATUS_COLORS, PAYMENT_LABELS } from '@/lib/utils'
import { Order, OrderStatus } from '@/types'
import toast from 'react-hot-toast'
import { Search, X, Ban } from 'lucide-react'

const STATUS_FILTERS: ('all' | OrderStatus)[] = ['all', 'pending', 'preparing', 'ready', 'completed', 'cancelled']

export default function OrdersPage() {
  const supabase = createClient()
  const [orders, setOrders] = useState<Order[]>([])
  const [filter, setFilter] = useState<'all' | OrderStatus>('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Order | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('users').select('restaurant_id').eq('id', user!.id).single()
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*, menu_items(name)), tables(table_number), users(name), payments(method)')
      .eq('restaurant_id', profile!.restaurant_id)
      .order('created_at', { ascending: false })
      .limit(100)
    setOrders((data as any) ?? [])
    setLoading(false)
  }

  async function cancelOrder(order: Order) {
    if (!confirm(`Cancel order #${order.id.slice(-4).toUpperCase()}? This can't be undone.`)) return
    const { error } = await supabase.from('orders').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', order.id)
    if (error) { toast.error(`Failed to cancel: ${error.message}`); return }
    toast.success('Order cancelled')
    setSelected(null)
    load()
  }

  const filteredByStatus = filter === 'all' ? orders : orders.filter(o => o.status === filter)
  const filtered = filteredByStatus.filter(o => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    const idMatch = o.id.slice(-4).toLowerCase().includes(q)
    const tableMatch = (o.table as any)?.table_number?.toString().includes(q)
    const cashierMatch = (o.cashier as any)?.name?.toLowerCase().includes(q)
    const itemMatch = o.items?.some((i: any) => i.menu_items?.name?.toLowerCase().includes(q))
    return idMatch || tableMatch || cashierMatch || itemMatch
  })

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Loading orders…</div>

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Orders</h1>
          <p className="text-sm text-gray-500">{filtered.length} of {orders.length} orders</p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="input pl-9 text-sm"
            placeholder="Search order, table, item, cashier…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1 w-fit overflow-x-auto">
        {STATUS_FILTERS.map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn('px-3 py-1.5 rounded-md text-xs font-medium capitalize whitespace-nowrap',
              filter === s ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-xs text-gray-500 font-medium">
              <th className="text-left px-4 py-3">Order</th>
              <th className="text-left px-4 py-3">Items</th>
              <th className="text-left px-4 py-3">Table</th>
              <th className="text-left px-4 py-3">Cashier</th>
              <th className="text-left px-4 py-3">Payment</th>
              <th className="text-right px-4 py-3">Total</th>
              <th className="text-right px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map(order => (
              <tr key={order.id} onClick={() => setSelected(order)} className="hover:bg-gray-50 cursor-pointer">
                <td className="px-4 py-3 font-medium text-gray-900">#{order.id.slice(-4).toUpperCase()}</td>
                <td className="px-4 py-3 text-gray-500">
                  {order.items?.map((i: any) => i.menu_items?.name).slice(0, 2).join(', ')}
                  {(order.items?.length ?? 0) > 2 && ` +${order.items!.length - 2} more`}
                </td>
                <td className="px-4 py-3 text-gray-500">{(order.table as any)?.table_number ? `Table ${(order.table as any).table_number}` : '—'}</td>
                <td className="px-4 py-3 text-gray-500">{(order.cashier as any)?.name ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500">{(order.payments as any)?.[0]?.method ? PAYMENT_LABELS[(order.payments as any)[0].method] : '—'}</td>
                <td className="px-4 py-3 text-right font-medium text-gray-900">{formatCurrency(order.total)}</td>
                <td className="px-4 py-3 text-right">
                  <span className={cn('badge capitalize', STATUS_COLORS[order.status])}>{order.status}</span>
                </td>
                <td className="px-4 py-3 text-right text-gray-400 text-xs">{formatDate(order.created_at, 'time')}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="text-center py-12 text-gray-400 text-sm">No orders found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Detail drawer */}
      {selected && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-end z-50" onClick={() => setSelected(null)}>
          <div className="bg-white h-full w-full max-w-sm shadow-xl p-6 overflow-y-auto animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Order #{selected.id.slice(-4).toUpperCase()}</h2>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1 mb-4">
              <span className={cn('badge capitalize', STATUS_COLORS[selected.status])}>{selected.status}</span>
              <p className="text-xs text-gray-400 mt-2">{formatDate(selected.created_at, 'long')} · {formatDate(selected.created_at, 'time')}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
              <div>
                <p className="text-xs text-gray-400">Table</p>
                <p className="text-gray-900">{(selected.table as any)?.table_number ? `Table ${(selected.table as any).table_number}` : '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Cashier</p>
                <p className="text-gray-900">{(selected.cashier as any)?.name ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Payment</p>
                <p className="text-gray-900">{(selected.payments as any)?.[0]?.method ? PAYMENT_LABELS[(selected.payments as any)[0].method] : '—'}</p>
              </div>
            </div>

            <div className="border-t border-gray-100 pt-3 mb-4">
              <p className="text-xs text-gray-400 mb-2">Items</p>
              <ul className="space-y-1.5">
                {selected.items?.map((i: any) => (
                  <li key={i.id} className="flex justify-between text-sm text-gray-700">
                    <span>{i.menu_items?.name} × {i.quantity}</span>
                    <span className="font-medium">{formatCurrency(i.subtotal)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-gray-50 rounded-lg p-3 space-y-1.5 mb-6">
              <div className="flex justify-between text-xs text-gray-500"><span>Subtotal</span><span>{formatCurrency(selected.subtotal)}</span></div>
              {selected.discount > 0 && <div className="flex justify-between text-xs text-red-500"><span>Discount</span><span>- {formatCurrency(selected.discount)}</span></div>}
              <div className="flex justify-between text-xs text-gray-500"><span>Tax</span><span>{formatCurrency(selected.tax)}</span></div>
              <div className="flex justify-between font-semibold text-gray-900 pt-1 border-t border-gray-200"><span>Total</span><span>{formatCurrency(selected.total)}</span></div>
            </div>

            {selected.status !== 'cancelled' && selected.status !== 'completed' && (
              <button onClick={() => cancelOrder(selected)} className="btn-secondary w-full text-sm py-2 text-red-500 hover:bg-red-50">
                <Ban className="w-4 h-4" /> Cancel order
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
