'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, Star, Zap, AlertTriangle, Eye, EyeOff, ArrowUp } from 'lucide-react'
import { subDays, startOfDay } from 'date-fns'

type Quadrant = 'star' | 'plow_horse' | 'puzzle' | 'dog'

interface EngineeredItem {
  id: string
  name: string
  category: string
  price: number
  recipe_cost: number
  food_cost_pct: number
  gross_profit: number
  profit_margin: number
  units_sold: number
  revenue: number
  total_profit: number
  quadrant: Quadrant
  action: string
}

const QUADRANT_CONFIG: Record<Quadrant, { label: string; color: string; bg: string; icon: any; description: string }> = {
  star:       { label: 'Stars',       color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200', icon: Star,         description: 'High popularity, high profit — promote these!' },
  plow_horse: { label: 'Plow Horses', color: 'text-blue-600',   bg: 'bg-blue-50 border-blue-200',     icon: TrendingUp,   description: 'High popularity, low profit — reduce cost or raise price' },
  puzzle:     { label: 'Puzzles',     color: 'text-purple-600', bg: 'bg-purple-50 border-purple-200', icon: Zap,          description: 'Low popularity, high profit — needs marketing push' },
  dog:        { label: 'Dogs',        color: 'text-gray-500',   bg: 'bg-gray-50 border-gray-200',     icon: EyeOff,       description: 'Low popularity, low profit — consider removing' },
}

const ACTIONS: Record<Quadrant, string[]> = {
  star:       ['Feature on menu', 'Promote on social media', 'Train staff to upsell'],
  plow_horse: ['Reduce portion slightly', 'Increase price by 5–10%', 'Find cheaper ingredient source'],
  puzzle:     ['Reposition on menu', 'Add to daily specials', 'Improve description/photo'],
  dog:        ['Remove from menu', 'Revamp the recipe', 'Keep if it has loyal customers'],
}

export default function MenuEngineeringPage() {
  const supabase = createClient()
  const [items, setItems] = useState<EngineeredItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Quadrant | 'all'>('all')
  const [sortBy, setSortBy] = useState<'profit' | 'revenue' | 'units' | 'food_cost'>('profit')

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('users').select('restaurant_id').eq('id', user!.id).single()
    const rid = profile!.restaurant_id
    const thirtyDaysAgo = startOfDay(subDays(new Date(), 30)).toISOString()

    const [{ data: menuItems }, { data: recipeVersions }, { data: orderItems }, { data: inventory }] = await Promise.all([
      supabase.from('menu_items').select('*, menu_categories(name)').eq('restaurant_id', rid),
      supabase.from('recipe_versions').select('*, recipe_ingredients(*, inventory_items(unit_cost))').eq('is_current', true),
      supabase.from('order_items').select('menu_item_id, quantity, unit_price, orders!inner(restaurant_id, status, created_at)')
        .eq('orders.restaurant_id', rid)
        .eq('orders.status', 'completed')
        .gte('orders.created_at', thirtyDaysAgo),
      supabase.from('inventory_items').select('id, unit_cost').eq('restaurant_id', rid),
    ])

    if (!menuItems) { setLoading(false); return }

    // Calculate recipe costs
    const recipeCostMap: Record<string, number> = {}
    recipeVersions?.forEach(v => {
      const cost = (v.recipe_ingredients ?? []).reduce((s: number, ing: any) => {
        const unitCost = ing.inventory_items?.unit_cost ?? 0
        const waste = (ing.waste_percentage ?? 0) / 100
        const yld = (ing.yield_percentage ?? 100) / 100
        return s + ((Number(ing.quantity) * (1 + waste)) / yld) * unitCost
      }, 0)
      recipeCostMap[v.menu_item_id] = cost
    })

    // Calculate sales data
    const salesMap: Record<string, { units: number; revenue: number }> = {}
    orderItems?.forEach((oi: any) => {
      if (!salesMap[oi.menu_item_id]) salesMap[oi.menu_item_id] = { units: 0, revenue: 0 }
      salesMap[oi.menu_item_id].units += oi.quantity
      salesMap[oi.menu_item_id].revenue += oi.unit_price * oi.quantity
    })

    // Calculate averages for quadrant classification
    const allUnits = menuItems.map(m => salesMap[m.id]?.units ?? 0)
    const allProfits = menuItems.map(m => {
      const cost = recipeCostMap[m.id] ?? 0
      return m.price - cost
    })
    const avgUnits = allUnits.reduce((s, u) => s + u, 0) / (allUnits.length || 1)
    const avgProfit = allProfits.reduce((s, p) => s + p, 0) / (allProfits.length || 1)

    const engineered: EngineeredItem[] = menuItems.map(item => {
      const recipe_cost = recipeCostMap[item.id] ?? 0
      const gross_profit = item.price - recipe_cost
      const food_cost_pct = item.price > 0 ? (recipe_cost / item.price) * 100 : 0
      const profit_margin = item.price > 0 ? (gross_profit / item.price) * 100 : 0
      const units_sold = salesMap[item.id]?.units ?? 0
      const revenue = salesMap[item.id]?.revenue ?? 0
      const total_profit = gross_profit * units_sold

      const isPopular = units_sold >= avgUnits
      const isProfitable = gross_profit >= avgProfit

      const quadrant: Quadrant =
        isPopular && isProfitable ? 'star' :
        isPopular && !isProfitable ? 'plow_horse' :
        !isPopular && isProfitable ? 'puzzle' : 'dog'

      const action = ACTIONS[quadrant][0]

      return {
        id: item.id,
        name: item.name,
        category: (item.category as any)?.name ?? '—',
        price: item.price,
        recipe_cost,
        food_cost_pct,
        gross_profit,
        profit_margin,
        units_sold,
        revenue,
        total_profit,
        quadrant,
        action,
      }
    })

    setItems(engineered)
    setLoading(false)
  }

  const filtered = items
    .filter(i => filter === 'all' || i.quadrant === filter)
    .sort((a, b) => {
      if (sortBy === 'profit') return b.total_profit - a.total_profit
      if (sortBy === 'revenue') return b.revenue - a.revenue
      if (sortBy === 'units') return b.units_sold - a.units_sold
      if (sortBy === 'food_cost') return b.food_cost_pct - a.food_cost_pct
      return 0
    })

  const totalRevenue = items.reduce((s, i) => s + i.revenue, 0)
  const totalProfit = items.reduce((s, i) => s + i.total_profit, 0)
  const avgFoodCost = items.length > 0 ? items.reduce((s, i) => s + i.food_cost_pct, 0) / items.length : 0

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Analyzing menu…</div>

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Menu Engineering</h1>
        <p className="text-sm text-gray-500">Profitability and popularity analysis — last 30 days</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="kpi-card"><span className="kpi-label">Total revenue</span><p className="kpi-value">{formatCurrency(totalRevenue)}</p></div>
        <div className="kpi-card"><span className="kpi-label">Total gross profit</span><p className="kpi-value text-emerald-600">{formatCurrency(totalProfit)}</p></div>
        <div className="kpi-card"><span className="kpi-label">Avg food cost %</span><p className={cn('kpi-value', avgFoodCost > 35 ? 'text-red-500' : avgFoodCost > 25 ? 'text-amber-600' : 'text-emerald-600')}>{avgFoodCost.toFixed(1)}%</p></div>
        <div className="kpi-card"><span className="kpi-label">Stars on menu</span><p className="kpi-value text-yellow-600">{items.filter(i => i.quadrant === 'star').length}</p></div>
      </div>

      {/* Quadrant summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {(Object.entries(QUADRANT_CONFIG) as [Quadrant, typeof QUADRANT_CONFIG[Quadrant]][]).map(([key, cfg]) => {
          const Icon = cfg.icon
          const count = items.filter(i => i.quadrant === key).length
          return (
            <button key={key} onClick={() => setFilter(filter === key ? 'all' : key)}
              className={cn('card p-4 text-left border-2 transition-all', cfg.bg, filter === key && 'ring-2 ring-brand-500')}>
              <div className="flex items-center gap-2 mb-1">
                <Icon className={cn('w-4 h-4', cfg.color)} />
                <span className={cn('text-sm font-semibold', cfg.color)}>{cfg.label}</span>
                <span className="ml-auto badge bg-white text-gray-600">{count}</span>
              </div>
              <p className="text-xs text-gray-500">{cfg.description}</p>
            </button>
          )
        })}
      </div>

      {/* Sort controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-500">Sort by:</span>
        {[
          { key: 'profit', label: 'Total profit' },
          { key: 'revenue', label: 'Revenue' },
          { key: 'units', label: 'Units sold' },
          { key: 'food_cost', label: 'Food cost %' },
        ].map(s => (
          <button key={s.key} onClick={() => setSortBy(s.key as any)}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-medium border',
              sortBy === s.key ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            )}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Items table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-xs text-gray-500 font-medium">
              <th className="text-left px-4 py-3">Item</th>
              <th className="text-left px-4 py-3">Category</th>
              <th className="text-left px-4 py-3">Quadrant</th>
              <th className="text-right px-4 py-3">Price</th>
              <th className="text-right px-4 py-3">Cost</th>
              <th className="text-right px-4 py-3">GP</th>
              <th className="text-right px-4 py-3">FC%</th>
              <th className="text-right px-4 py-3">Units</th>
              <th className="text-right px-4 py-3">Revenue</th>
              <th className="text-right px-4 py-3">Total profit</th>
              <th className="text-left px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map(item => {
              const cfg = QUADRANT_CONFIG[item.quadrant]
              const Icon = cfg.icon
              return (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{item.category}</td>
                  <td className="px-4 py-3">
                    <span className={cn('badge flex items-center gap-1 w-fit', cfg.bg, cfg.color)}>
                      <Icon className="w-3 h-3" /> {cfg.label.slice(0, -1)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(item.price)}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{item.recipe_cost > 0 ? formatCurrency(item.recipe_cost) : '—'}</td>
                  <td className="px-4 py-3 text-right font-medium text-emerald-600">{item.recipe_cost > 0 ? formatCurrency(item.gross_profit) : '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {item.recipe_cost > 0 ? (
                      <span className={cn('badge', item.food_cost_pct > 35 ? 'bg-red-100 text-red-600' : item.food_cost_pct > 25 ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600')}>
                        {item.food_cost_pct.toFixed(1)}%
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">{item.units_sold}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(item.revenue)}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">{item.recipe_cost > 0 ? formatCurrency(item.total_profit) : '—'}</td>
                  <td className="px-4 py-3 text-xs text-brand-600">{item.action}</td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={11} className="text-center py-12 text-gray-400 text-sm">No items. Add menu items and build recipes to see analysis.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
