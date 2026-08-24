'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn, formatDate } from '@/lib/utils'
import { Order, OrderStatus } from '@/types'
import toast from 'react-hot-toast'
import { Clock, ChefHat, CheckCircle2, Timer, TrendingUp, AlertTriangle, BarChart3 } from 'lucide-react'
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
  const [completedToday, setCompletedToday] = useState<any[]>([])
  const [restaurantId, setRestaurantId] = useState('')
  const [role, setRole] = useState('')
  const [showAnalytics, setShowAnalytics] = useState(false)
  const [now, setNow] = useState(Date.now())

  // Live clock for wait time display
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase.from('users').select('restaurant_id, role').eq('id', user!.id).single()
      setRestaurantId(profile!.restaurant_id)
      setRole(profile!.role)
      await loadOrders(profile!.restaurant_id)
      await loadCompletedToday(profile!.restaurant_id)
    }
    init()
  }, [])

  useEffect(() => {
    if (!restaurantId) return
    const channel = supabase.channel('kitchen-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` },
        () => {
          loadOrders(restaurantId)
          loadCompletedToday(restaurantId)
          toast('Order update', { icon: '🔔' })
        }
      ).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [restaurantId])

  async function loadOrders(rid: string) {
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*, menu_items(name, prep_time, cook_time)), tables(table_number)')
      .eq('restaurant_id', rid)
      .in('status', ['pending', 'preparing', 'ready'])
      .order('created_at', { ascending: true })
    setOrders((data as any) ?? [])
  }

  async function loadCompletedToday(rid: string) {
    const todayStart = new Date(); todayStart.setHours(0,0,0,0)
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(menu_items(name))')
      .eq('restaurant_id', rid)
      .eq('status', 'completed')
      .gte('created_at', todayStart.toISOString())
      .order('updated_at', { ascending: false })
    setCompletedToday((data as any) ?? [])
  }

  async function advanceStatus(order: Order) {
    const next = NEXT_STATUS[order.status]
    if (!next) return
    await supabase.from('orders').update({ status: next, updated_at: new Date().toISOString() }).eq('id', order.id)
    loadOrders(restaurantId)
    if (next === 'completed') {
      toast.success('Order completed — inventory auto-updated')
      loadCompletedToday(restaurantId)
    } else {
      toast.success(`Order moved to ${next}`)
    }
  }

  function getWaitMinutes(createdAt: string) {
    return Math.floor((now - new Date(createdAt).getTime()) / 60000)
  }

  // Analytics calculations
  const avgWaitTime = completedToday.length > 0
    ? Math.round(completedToday.reduce((s, o) => {
        const created = new Date(o.created_at).getTime()
        const updated = new Date(o.updated_at).getTime()
        return s + (updated - created) / 60000
      }, 0) / completedToday.length)
    : 0

  const longestWaiting = orders.length > 0
    ? Math.max(...orders.map(o => getWaitMinutes(o.created_at)))
    : 0

  const itemCountsToday: Record<string, number> = {}
  completedToday.forEach(o => {
    o.order_items?.forEach((item: any) => {
      const name = item.menu_items?.name ?? 'Unknown'
      itemCountsToday[name] = (itemCountsToday[name] ?? 0) + item.quantity
    })
  })
  const topItems = Object.entries(itemCountsToday).sort((a, b) => b[1] - a[1]).slice(0, 5)

  return (
    <div className="space-y-4 animate-fade-in p-6 max-w-7xl mx-auto min-h-screen">
      <StandaloneTopBar
        title="Kitchen Display"
        subtitle="Live order queue · inventory auto-deducted on completion"
        backHref={role === 'kitchen' ? null : '/dashboard'}
        right={
          <div className="flex items-center gap-2">
            <button onClick={() => setShowAnalytics(!showAnalytics)}
              className={cn('btn-secondary text-xs py-1.5 px-3', showAnalytics && 'bg-brand-50 text-brand-600')}>
              <BarChart3 className="w-3.5 h-3.5" /> Analytics
            </button>
            <span className="badge bg-emerald-100 text-emerald-700">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-1.5 animate-pulse" /> Live
            </span>
          </div>
        }
      />

      {/* Analytics panel */}
      {showAnalytics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="kpi-card">
            <span className="kpi-label flex items-center gap-1"><Timer className="w-3 h-3" /> Avg wait time</span>
            <p className="kpi-value">{avgWaitTime} min</p>
          </div>
          <div className="kpi-card">
            <span className="kpi-label flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Completed today</span>
            <p className="kpi-value">{completedToday.length}</p>
          </div>
          <div className="kpi-card">
            <span className="kpi-label flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Longest waiting</span>
            <p className={cn('kpi-value', longestWaiting > 15 ? 'text-red-600' : longestWaiting > 10 ? 'text-amber-600' : 'text-gray-900')}>
              {longestWaiting} min
            </p>
          </div>
          <div className="kpi-card">
            <span className="kpi-label flex items-center gap-1"><ChefHat className="w-3 h-3" /> Active orders</span>
            <p className="kpi-value">{orders.length}</p>
          </div>

          {topItems.length > 0 && (
            <div className="card p-4 lg:col-span-4">
              <p className="text-sm font-medium text-gray-700 mb-3">Top items today</p>
              <div className="flex gap-6 flex-wrap">
                {topItems.map(([name, count]) => (
                  <div key={name} className="flex items-center gap-2">
                    <span className="text-sm text-gray-700">{name}</span>
                    <span className="badge bg-brand-100 text-brand-700">{count}×</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Order columns */}
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
                  const waitMins = getWaitMinutes(order.created_at)
                  const isUrgent = waitMins > 15
                  const isWarning = waitMins > 10 && !isUrgent

                  // Estimated prep time from recipe data
                  const estTime = order.items?.reduce((s: number, item: any) => {
                    return s + ((item.menu_items?.prep_time ?? 0) + (item.menu_items?.cook_time ?? 0)) * item.quantity
                  }, 0) ?? 0

                  return (
                    <div key={order.id} className={cn('card p-4 border-2', col.color,
                      isUrgent && 'border-red-400 bg-red-50',
                      isWarning && 'border-amber-400'
                    )}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-gray-900">#{order.id.slice(-4).toUpperCase()}</span>
                        <div className="flex items-center gap-2">
                          {isUrgent && <span className="badge bg-red-100 text-red-600 text-xs">URGENT</span>}
                          <span className={cn('text-xs flex items-center gap-1',
                            isUrgent ? 'text-red-600 font-semibold' : isWarning ? 'text-amber-600' : 'text-gray-500'
                          )}>
                            <Clock className="w-3 h-3" /> {waitMins}m
                          </span>
                        </div>
                      </div>

                      {(order.table as any)?.table_number && (
                        <p className="text-xs text-gray-500 mb-2 font-medium">Table {(order.table as any).table_number}</p>
                      )}

                      {estTime > 0 && (
                        <p className="text-xs text-gray-400 mb-2 flex items-center gap-1">
                          <Timer className="w-3 h-3" /> Est. {estTime} min
                        </p>
                      )}

                      <ul className="space-y-1 mb-3">
                        {order.items?.map((item: any) => (
                          <li key={item.id} className="text-sm text-gray-700 flex justify-between items-center">
                            <span>{item.menu_items?.name}</span>
                            <span className="font-bold text-gray-900 bg-white rounded px-1.5 py-0.5 text-xs">×{item.quantity}</span>
                          </li>
                        ))}
                      </ul>

                      <button onClick={() => advanceStatus(order)} className={cn('btn-primary w-full text-xs py-2',
                        isUrgent && 'bg-red-500 hover:bg-red-600 border-red-500'
                      )}>
                        {col.status === 'pending' && '▶ Start preparing'}
                        {col.status === 'preparing' && '✓ Mark ready'}
                        {col.status === 'ready' && <span className="flex items-center justify-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Complete & deduct inventory</span>}
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

      {/* Completed today */}
      {completedToday.length > 0 && (
        <div className="card p-4">
          <p className="text-sm font-medium text-gray-700 mb-3">Completed today ({completedToday.length})</p>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {completedToday.slice(0, 10).map(o => (
              <div key={o.id} className="flex items-center justify-between text-xs text-gray-500">
                <span className="font-medium text-gray-700">#{o.id.slice(-4).toUpperCase()}</span>
                <span>{o.order_items?.map((i: any) => i.menu_items?.name).join(', ')}</span>
                <span>{formatDate(o.updated_at, 'time')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
