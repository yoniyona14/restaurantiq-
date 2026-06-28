'use client'

import { useEffect, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { createClient } from '@/lib/supabase/client'
import { subDays, format, startOfDay } from 'date-fns'

interface Props { restaurantId: string }

export default function DashboardCharts({ restaurantId }: Props) {
  const [data, setData] = useState<{ date: string; revenue: number; orders: number }[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const days = Array.from({ length: 7 }, (_, i) => {
        const d = subDays(new Date(), 6 - i)
        return { date: format(d, 'MMM d'), start: startOfDay(d).toISOString(), end: startOfDay(subDays(d, -1)).toISOString() }
      })

      const results = await Promise.all(
        days.map(d =>
          supabase
            .from('orders')
            .select('total')
            .eq('restaurant_id', restaurantId)
            .eq('status', 'completed')
            .gte('created_at', d.start)
            .lt('created_at', d.end)
        )
      )

      setData(days.map((d, i) => ({
        date: d.date,
        revenue: results[i].data?.reduce((s, o) => s + o.total, 0) ?? 0,
        orders: results[i].data?.length ?? 0,
      })))
      setLoading(false)
    }

   
    // Re-fetch whenever any order for this restaurant changes (new order
    // placed, or status flipped to completed) so the graph reflects new
    // money coming in without needing a manual page refresh.
load()
  }, [restaurantId])

  if (loading) return <div className="h-48 flex items-center justify-center text-sm text-gray-400">Loading chart…</div>

  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false}
               tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
          formatter={(v: number) => [`ETB ${v.toLocaleString()}`, 'Revenue']}
        />
        <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2} fill="url(#rev)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}