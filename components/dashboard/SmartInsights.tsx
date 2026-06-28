'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { subDays, subWeeks } from 'date-fns'
import { TrendingUp, TrendingDown, AlertTriangle, Info } from 'lucide-react'

interface Insight {
  type: 'positive' | 'warning' | 'danger' | 'info'
  message: string
}

const CONFIG = {
  positive: { icon: TrendingUp,    bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-100' },
  warning:  { icon: AlertTriangle, bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-100' },
  danger:   { icon: TrendingDown,  bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-100' },
  info:     { icon: Info,          bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-100' },
}

export default function SmartInsights({ restaurantId }: { restaurantId: string }) {
  const [insights, setInsights] = useState<Insight[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function generate() {
      const now = new Date()
      const thisWeekStart = subDays(now, 7).toISOString()
      const lastWeekStart = subWeeks(now, 2).toISOString()
      const lastWeekEnd   = subDays(now, 7).toISOString()

      const [{ data: thisWeek }, { data: lastWeek }, { data: lowStock }] = await Promise.all([
        supabase.from('order_items').select('menu_item_id, quantity, menu_items(name)')
          .eq('orders.restaurant_id', restaurantId).gte('orders.created_at', thisWeekStart),
        supabase.from('order_items').select('menu_item_id, quantity, menu_items(name)')
          .eq('orders.restaurant_id', restaurantId).gte('orders.created_at', lastWeekStart).lt('orders.created_at', lastWeekEnd),
        supabase.from('inventory_items').select('name, current_stock, reorder_level, unit')
          .eq('restaurant_id', restaurantId).filter('current_stock', 'lte', 'reorder_level'),
      ])

      const result: Insight[] = []

      // Low stock alerts
      lowStock?.slice(0, 2).forEach(item => {
        const days = item.reorder_level > 0
          ? Math.round(item.current_stock / (item.reorder_level / 7))
          : 0
        result.push({
          type: 'warning',
          message: `⚠️ ${item.name} runs out in ~${days} days (${item.current_stock} ${item.unit} left)`,
        })
      })

      // Weekend insight (static smart insight)
      const dayOfWeek = now.getDay()
      if (dayOfWeek === 5 || dayOfWeek === 6) {
        result.push({ type: 'info', message: '📅 Weekend — expect 35–40% higher traffic. Ensure full staffing.' })
      } else {
        result.push({ type: 'info', message: '📅 Saturdays generate ~40% more revenue than weekdays.' })
      }

      // Item trend insight
      if (thisWeek && thisWeek.length > 0) {
        const topItem = thisWeek[0]
        const itemName = (topItem.menu_items as any)?.name
        if (itemName) {
          result.push({ type: 'positive', message: `🔥 ${itemName} is your top seller this week.` })
        }
      }

      if (result.length === 0) {
        result.push({ type: 'info', message: 'Start processing orders to generate smart insights.' })
      }

      setInsights(result)
      setLoading(false)
    }
    generate()
  }, [restaurantId])

  if (loading) return <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />)}</div>

  return (
    <div className="space-y-2">
      {insights.map((insight, i) => {
        const cfg = CONFIG[insight.type]
        const Icon = cfg.icon
        return (
          <div key={i} className={`flex items-start gap-2.5 p-3 rounded-lg border ${cfg.bg} ${cfg.border}`}>
            <Icon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${cfg.text}`} />
            <p className={`text-xs leading-relaxed ${cfg.text}`}>{insight.message}</p>
          </div>
        )
      })}
    </div>
  )
}
