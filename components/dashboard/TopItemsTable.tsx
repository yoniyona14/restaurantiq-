'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { subDays } from 'date-fns'

interface ItemStat { name: string; orders: number; revenue: number }

export default function TopItemsTable({ restaurantId }: { restaurantId: string }) {
  const [items, setItems] = useState<ItemStat[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const weekAgo = subDays(new Date(), 7).toISOString()
      const { data } = await supabase
        .from('order_items')
        .select('quantity, subtotal, menu_items(name)')
        .gte('orders.created_at', weekAgo)
        .eq('orders.restaurant_id', restaurantId)
        .eq('orders.status', 'completed')

      if (!data) { setLoading(false); return }

      const map = new Map<string, ItemStat>()
      data.forEach(row => {
        const name = (row.menu_items as any)?.name ?? 'Unknown'
        const cur = map.get(name) ?? { name, orders: 0, revenue: 0 }
        map.set(name, { name, orders: cur.orders + row.quantity, revenue: cur.revenue + row.subtotal })
      })

      setItems(Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 6))
      setLoading(false)
    }
    load()
  }, [restaurantId])

  if (loading) return <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}</div>
  if (items.length === 0) return <p className="text-sm text-gray-400">No sales data yet.</p>

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-gray-400 font-medium">
          <th className="text-left pb-2">Item</th>
          <th className="text-right pb-2">Orders</th>
          <th className="text-right pb-2">Revenue</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50">
        {items.map((item, i) => (
          <tr key={item.name} className="group">
            <td className="py-2 text-gray-700 flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-brand-100 text-brand-700 text-xs flex items-center justify-center font-medium flex-shrink-0">
                {i + 1}
              </span>
              {item.name}
            </td>
            <td className="py-2 text-right text-gray-500">{item.orders}</td>
            <td className="py-2 text-right text-emerald-600 font-medium">{formatCurrency(item.revenue)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
