'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { startOfDay } from 'date-fns'

interface StaffStat { name: string; orders: number; revenue: number }

export default function StaffTable({ restaurantId }: { restaurantId: string }) {
  const [staff, setStaff] = useState<StaffStat[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const today = startOfDay(new Date()).toISOString()
      const { data } = await supabase
        .from('orders')
        .select('total, users(name)')
        .eq('restaurant_id', restaurantId)
        .eq('status', 'completed')
        .gte('created_at', today)

      if (!data) { setLoading(false); return }

      const map = new Map<string, StaffStat>()
      data.forEach(row => {
        const name = (row.users as any)?.name ?? 'Unknown'
        const cur = map.get(name) ?? { name, orders: 0, revenue: 0 }
        map.set(name, { name, orders: cur.orders + 1, revenue: cur.revenue + row.total })
      })

      setStaff(Array.from(map.values()).sort((a, b) => b.revenue - a.revenue))
      setLoading(false)
    }
    load()
  }, [restaurantId])

  if (loading) return <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}</div>
  if (staff.length === 0) return <p className="text-sm text-gray-400">No orders processed today.</p>

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-gray-400 font-medium">
          <th className="text-left pb-2">Staff member</th>
          <th className="text-right pb-2">Orders</th>
          <th className="text-right pb-2">Revenue</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {staff.map((s, i) => (
          <tr key={s.name}>
            <td className="py-2 text-gray-700 flex items-center gap-2">
              {i === 0 && <span className="text-amber-500">👑</span>}
              {i > 0 && <span className="w-4 h-4 rounded-full bg-gray-100 text-gray-500 text-xs flex items-center justify-center">{i + 1}</span>}
              {s.name}
            </td>
            <td className="py-2 text-right text-gray-500">{s.orders}</td>
            <td className="py-2 text-right text-emerald-600 font-medium">{formatCurrency(s.revenue)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
