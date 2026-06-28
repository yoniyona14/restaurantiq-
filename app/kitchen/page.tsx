'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn, formatDate } from '@/lib/utils'
import { Order, OrderStatus } from '@/types'
import toast from 'react-hot-toast'
import { Clock, ChefHat, CheckCircle2 } from 'lucide-react'
import StandaloneTopBar from '@/components/ui/StandaloneTopBar'

const COLUMNS: { status: OrderStatus; label: string; color: string }[] = [
  { status: 'pending',   label: 'New orders', color: 'border-amber-300 bg-amber-50' },
  { status: 'preparing', label: 'Preparing',  color: 'border-blue-300 bg-blue-50' },
  { status: 'ready',     label: 'Ready',      color: 'border-emerald-300 bg-emerald-50' },
]

const NEXT_STATUS: Record<string, OrderStatus> = {
  pending: 'preparing',
  preparing: 'ready',
  ready: 'completed',
}

export default function KitchenPage() {
  const supabase = createClient()
  const [orders, setOrders] = useState<Order[]>([])
  const [restaurantId, setRestaurantId] = useState<string>('')
  const [role, setRole] = useState<string>('')

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase.from('users').select('restaurant_id, role').eq('id', user!.id).single()
      setRestaurantId(profile!.restaurant_id)
      setRole(profile!.role)
      await loadOrders(profile!.restaurant_id)
    }
    init()
  }, [])

  async function loadOrders(rid: string) {
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*, menu_items(name)), tables(table_number)')
      .eq('restaurant_id', rid)
      .in('status', ['pending', 'preparing', 'ready'])
      .order('created_at', { ascending: true })
    setOrders((data as any) ?? [])
  }

  // Realtime subscription
  useEffect(() => {
    if (!restaurantId) return
    const channel = supabase
      .channel('kitchen-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` },
        () => { loadOrders(restaurantId); toast('New order received!', { icon: '🔔' }) }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [restaurantId])

  async function advanceStatus(order: Order) {
    const next = NEXT_STATUS[order.status]
    if (!next) return
    await supabase.from('orders').update({ status: next, updated_at: new Date().toISOString() }).eq('id', order.id)
    loadOrders(restaurantId)
    toast.success(`Order moved to ${next}`)
  }

  return (
    <div className="space-y-4 animate-fade-in p-6 max-w-7xl mx-auto min-h-screen">
      <StandaloneTopBar
        title="Kitchen Display"
        subtitle="Live order queue · updates automatically"
        backHref={role === 'kitchen' ? null : '/dashboard'}
        right={
          <span className="badge bg-emerald-100 text-emerald-700">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-1.5 animate-pulse" /> Live
          </span>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {COLUMNS.map(col => {
          const colOrders = orders.filter(o => o.status === col.status)
          return (
            <div key={col.status} className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold text-gray-700">{col.label}</h2>
                <span className="badge bg-gray-100 text-gray-600">{colOrders.length}</span>
              </div>
              <div className="space-y-3 min-h-[200px]">
                {colOrders.map(order => {
                  const isNew = col.status === 'pending' && (Date.now() - new Date(order.created_at).getTime()) < 60000
                  return (
                    <div key={order.id} className={cn('card p-4 border-2', col.color, isNew && 'order-new')}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-gray-900">
                          #{order.id.slice(-4).toUpperCase()}
                        </span>
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {formatDate(order.created_at, 'time')}
                        </span>
                      </div>
                      {(order.table as any)?.table_number && (
                        <p className="text-xs text-gray-500 mb-2">Table {(order.table as any).table_number}</p>
                      )}
                      <ul className="space-y-1 mb-3">
                        {order.items?.map((item: any) => (
                          <li key={item.id} className="text-sm text-gray-700 flex justify-between">
                            <span>{item.menu_items?.name}</span>
                            <span className="font-medium">× {item.quantity}</span>
                          </li>
                        ))}
                      </ul>
                      <button
                        onClick={() => advanceStatus(order)}
                        className="btn-primary w-full text-xs py-2"
                      >
                        {col.status === 'pending' && 'Start preparing'}
                        {col.status === 'preparing' && 'Mark ready'}
                        {col.status === 'ready' && (<><CheckCircle2 className="w-3.5 h-3.5" /> Complete order</>)}
                      </button>
                    </div>
                  )
                })}
                {colOrders.length === 0 && (
                  <div className="h-24 flex items-center justify-center text-xs text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                    No orders
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
