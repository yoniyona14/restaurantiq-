'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts'
import { subDays, format, startOfDay } from 'date-fns'

const COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']

export default function AnalyticsPage() {
  const supabase = createClient()
  const [revenue30, setRevenue30] = useState<{ date: string; revenue: number }[]>([])
  const [categoryData, setCategoryData] = useState<{ name: string; value: number }[]>([])
  const [heatmap, setHeatmap] = useState<number[][]>(Array.from({ length: 7 }, () => Array(24).fill(0)))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase.from('users').select('restaurant_id').eq('id', user!.id).single()
      const rid = profile!.restaurant_id

      // 30-day revenue
      const days = Array.from({ length: 30 }, (_, i) => {
        const d = subDays(new Date(), 29 - i)
        return { date: format(d, 'MMM d'), start: startOfDay(d).toISOString(), end: startOfDay(subDays(d, -1)).toISOString() }
      })
      const results = await Promise.all(days.map(d =>
        supabase.from('orders').select('total').eq('restaurant_id', rid).eq('status', 'completed').gte('created_at', d.start).lt('created_at', d.end)
      ))
      setRevenue30(days.map((d, i) => ({ date: d.date, revenue: results[i].data?.reduce((s, o) => s + o.total, 0) ?? 0 })))

      // Category breakdown
      const { data: orderItems } = await supabase
        .from('order_items')
        .select('subtotal, menu_items(menu_categories(name))')
        .eq('orders.restaurant_id', rid)
        .eq('orders.status', 'completed')

      const catMap = new Map<string, number>()
      orderItems?.forEach((row: any) => {
        const cat = row.menu_items?.menu_categories?.name ?? 'Other'
        catMap.set(cat, (catMap.get(cat) ?? 0) + row.subtotal)
      })
      setCategoryData(Array.from(catMap.entries()).map(([name, value]) => ({ name, value })))

      // Heatmap: all completed orders, group by day/hour
      const { data: allOrders } = await supabase.from('orders').select('created_at').eq('restaurant_id', rid).eq('status', 'completed')
      const grid = Array.from({ length: 7 }, () => Array(24).fill(0))
      allOrders?.forEach(o => {
        const d = new Date(o.created_at)
        grid[d.getDay()][d.getHours()]++
      })
      setHeatmap(grid)

      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Loading analytics…</div>

  const maxHeat = Math.max(...heatmap.flat(), 1)
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Analytics</h1>
        <p className="text-sm text-gray-500">Revenue trends, product mix, and busy hours</p>
      </div>

      {/* Revenue trend */}
      <div className="card p-5">
        <h2 className="text-sm font-medium text-gray-700 mb-4">Revenue — last 30 days</h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={revenue30} margin={{ left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} interval={4} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: number) => [`ETB ${v.toLocaleString()}`, 'Revenue']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Line type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Category pie */}
        <div className="card p-5">
          <h2 className="text-sm font-medium text-gray-700 mb-4">Revenue by category</h2>
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-sm text-gray-400">No sales data yet</div>
          )}
        </div>

        {/* Heatmap */}
        <div className="card p-5">
          <h2 className="text-sm font-medium text-gray-700 mb-4">Busy hours heatmap</h2>
          <div className="overflow-x-auto">
            <div className="min-w-[480px]">
              <div className="flex gap-0.5 mb-1 pl-8">
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="w-4 text-[9px] text-gray-400 text-center">{h % 6 === 0 ? h : ''}</div>
                ))}
              </div>
              {heatmap.map((row, day) => (
                <div key={day} className="flex gap-0.5 items-center mb-0.5">
                  <span className="w-7 text-[10px] text-gray-400">{days[day]}</span>
                  {row.map((val, hour) => (
                    <div
                      key={hour}
                      className="w-4 h-4 rounded-sm"
                      style={{ backgroundColor: `rgba(99, 102, 241, ${val / maxHeat || 0.05})` }}
                      title={`${days[day]} ${hour}:00 — ${val} orders`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-3">Darker = busier. Hover over a cell to see order count.</p>
        </div>
      </div>
    </div>
  )
}
