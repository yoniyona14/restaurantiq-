'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, cn } from '@/lib/utils'
import { AlertTriangle, CheckCircle2, RefreshCw, ChefHat, ArrowRight } from 'lucide-react'
import { subDays, startOfDay, format } from 'date-fns'
import { useRouter } from 'next/navigation'

interface ProductionRecommendation {
  menu_item_id: string
  name: string
  image_url?: string
  recommended_qty: number
  unit: string
  confidence: 'high' | 'medium' | 'low'
  avg_daily_sales: number
  ingredients_ok: boolean
  shortages: { name: string; need: number; have: number; unit: string }[]
  // top ingredient for prep reference
  primary_ingredient_id?: string
  primary_ingredient_name?: string
  primary_ingredient_qty?: number
  primary_ingredient_unit?: string
}

export default function ProductionPlanningPage() {
  const supabase = createClient()
  const router = useRouter()
  const [recommendations, setRecommendations] = useState<ProductionRecommendation[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [coverDays, setCoverDays] = useState(1)

  useEffect(() => { analyze() }, [])

  async function analyze() {
    setRefreshing(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase.from('users').select('restaurant_id').eq('id', user!.id).single()
      const rid = profile!.restaurant_id
      const thirtyDaysAgo = startOfDay(subDays(new Date(), 30)).toISOString()

      const [{ data: menuItems }, { data: recipeVersions }, { data: orderItems }, { data: inv }] = await Promise.all([
        supabase.from('menu_items').select('*').eq('restaurant_id', rid).eq('is_available', true),
        supabase.from('recipe_versions')
          .select('*, recipe_ingredients(*, inventory_items(id, name, unit, current_stock, unit_cost))')
          .eq('is_current', true),
        supabase.from('order_items')
          .select('menu_item_id, quantity, orders!inner(restaurant_id, status, created_at)')
          .eq('orders.restaurant_id', rid)
          .eq('orders.status', 'completed')
          .gte('orders.created_at', thirtyDaysAgo),
        supabase.from('inventory_items').select('*').eq('restaurant_id', rid),
      ])

      // Build daily sales map
      const dailySalesMap: Record<string, Record<string, number>> = {}
      orderItems?.forEach((oi: any) => {
        const day = format(new Date(oi.orders.created_at), 'yyyy-MM-dd')
        if (!dailySalesMap[oi.menu_item_id]) dailySalesMap[oi.menu_item_id] = {}
        dailySalesMap[oi.menu_item_id][day] = (dailySalesMap[oi.menu_item_id][day] ?? 0) + oi.quantity
      })

      const recs: ProductionRecommendation[] = []

      for (const item of menuItems ?? []) {
        const daySales = dailySalesMap[item.id] ?? {}
        const days = Object.values(daySales)
        if (days.length === 0) continue

        const avgDaily = days.reduce((s, d) => s + d, 0) / 30
        const recommended = Math.ceil(avgDaily * coverDays * 1.1)
        if (recommended === 0) continue

        const version = recipeVersions?.find(v => v.menu_item_id === item.id)
        const shortages: ProductionRecommendation['shortages'] = []
        let ingredients_ok = true
        let primary_ingredient_id: string | undefined
        let primary_ingredient_name: string | undefined
        let primary_ingredient_qty: number | undefined
        let primary_ingredient_unit: string | undefined

        if (version?.recipe_ingredients) {
          let maxQty = 0
          for (const ing of version.recipe_ingredients) {
            if (!ing.inventory_id || !ing.inventory_items) continue
            const invItem = ing.inventory_items as any
            const needed = Number(ing.quantity) * recommended * (1 + (ing.waste_percentage ?? 0) / 100)
            if (invItem.current_stock < needed) {
              ingredients_ok = false
              shortages.push({ name: invItem.name, need: Math.ceil(needed * 100) / 100, have: invItem.current_stock, unit: invItem.unit })
            }
            // Track primary (largest qty) ingredient for prep batch pre-fill
            if (Number(ing.quantity) > maxQty) {
              maxQty = Number(ing.quantity)
              primary_ingredient_id = invItem.id
              primary_ingredient_name = invItem.name
              primary_ingredient_qty = needed
              primary_ingredient_unit = invItem.unit
            }
          }
        }

        recs.push({
          menu_item_id: item.id,
          name: item.name,
          image_url: item.image_url ?? undefined,
          recommended_qty: recommended,
          unit: 'portions',
          confidence: days.length >= 20 ? 'high' : days.length >= 10 ? 'medium' : 'low',
          avg_daily_sales: Math.round(avgDaily * 10) / 10,
          ingredients_ok,
          shortages,
          primary_ingredient_id,
          primary_ingredient_name,
          primary_ingredient_qty,
          primary_ingredient_unit,
        })
      }

      recs.sort((a, b) => {
        if (!a.ingredients_ok && b.ingredients_ok) return -1
        if (a.ingredients_ok && !b.ingredients_ok) return 1
        return b.recommended_qty - a.recommended_qty
      })

      setRecommendations(recs)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  // Send recommendation to prep batches page via URL params
  function sendToPrep(rec: ProductionRecommendation) {
    if (!rec.primary_ingredient_id) {
      alert('No inventory ingredient linked to this recipe. Build the recipe first.')
      return
    }
    const params = new URLSearchParams({
      inventory_id: rec.primary_ingredient_id,
      raw_quantity: String(Math.ceil((rec.primary_ingredient_qty ?? 0) * 1.1)), // raw slightly higher
      name: rec.name,
    })
    router.push(`/dashboard/prep-batches?${params.toString()}`)
  }

  const shortageCount = recommendations.filter(r => !r.ingredients_ok).length
  const readyCount    = recommendations.filter(r => r.ingredients_ok).length

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-400">
      <RefreshCw className="w-6 h-6 animate-spin" />
      <p className="text-sm">Generating production plan…</p>
    </div>
  )

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Production Planning</h1>
          <p className="text-sm text-gray-500">
            Based on 30-day sales history · Click <strong>Send to Prep</strong> to pre-fill a prep batch
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Cover</label>
            <select className="input text-sm py-1.5 w-24" value={coverDays} onChange={e => { setCoverDays(Number(e.target.value)); analyze() }}>
              <option value={1}>1 day</option>
              <option value={2}>2 days</option>
              <option value={3}>3 days</option>
            </select>
          </div>
          <button onClick={analyze} disabled={refreshing} className="btn-secondary text-sm py-2 px-4">
            <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} /> Recalculate
          </button>
        </div>
      </div>

      {/* Flow indicator */}
      <div className="flex items-center gap-2 text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
        <span className="font-medium text-blue-700">Flow:</span>
        <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium">Production Planning</span>
        <ArrowRight className="w-3 h-3 text-blue-400" />
        <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium">Prep Batches</span>
        <ArrowRight className="w-3 h-3 text-blue-400" />
        <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium">Inventory (auto-deducted)</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="kpi-card"><span className="kpi-label">Items to prepare</span><p className="kpi-value">{recommendations.length}</p></div>
        <div className="kpi-card"><span className="kpi-label">Ready to prep</span><p className="kpi-value text-emerald-600">{readyCount}</p></div>
        <div className="kpi-card"><span className="kpi-label">Ingredient shortages</span><p className={cn('kpi-value', shortageCount > 0 && 'text-red-500')}>{shortageCount}</p></div>
        <div className="kpi-card"><span className="kpi-label">Cover period</span><p className="kpi-value">{coverDays} day{coverDays > 1 ? 's' : ''}</p></div>
      </div>

      {shortageCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800">Ingredient shortages detected</p>
            <p className="text-xs text-red-700 mt-1">{shortageCount} item{shortageCount > 1 ? 's' : ''} cannot be fully prepped. Create purchase orders first.</p>
          </div>
          <a href="/dashboard/purchasing" className="text-xs text-red-600 hover:underline whitespace-nowrap">Order now →</a>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {recommendations.map(rec => (
          <div key={rec.menu_item_id} className={cn('card p-4', !rec.ingredients_ok && 'border-red-200 bg-red-50/30')}>
            {rec.image_url && <img src={rec.image_url} alt={rec.name} className="w-full h-24 object-cover rounded-lg mb-3" />}
            <div className="flex items-start justify-between mb-2">
              <p className="font-medium text-gray-900">{rec.name}</p>
              <span className={cn('badge text-xs', {
                'bg-emerald-100 text-emerald-700': rec.confidence === 'high',
                'bg-amber-100 text-amber-700':     rec.confidence === 'medium',
                'bg-gray-100 text-gray-500':       rec.confidence === 'low',
              })}>
                {rec.confidence}
              </span>
            </div>

            <div className="bg-gray-50 rounded-lg p-3 mb-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Prepare</span>
                <span className="text-2xl font-bold text-gray-900">{rec.recommended_qty}</span>
              </div>
              <p className="text-xs text-gray-400 text-right">portions · avg {rec.avg_daily_sales}/day × {coverDays}d</p>
            </div>

            {rec.primary_ingredient_name && (
              <p className="text-xs text-gray-500 mb-2">
                Primary ingredient: <span className="font-medium text-gray-700">{rec.primary_ingredient_name}</span>
                {rec.primary_ingredient_qty && ` · ~${rec.primary_ingredient_qty.toFixed(1)} ${rec.primary_ingredient_unit ?? ''} needed`}
              </p>
            )}

            {rec.ingredients_ok ? (
              <div className="flex items-center gap-1.5 text-xs text-emerald-600 mb-3">
                <CheckCircle2 className="w-3.5 h-3.5" /> All ingredients available
              </div>
            ) : (
              <div className="space-y-1 mb-3">
                <p className="text-xs font-medium text-red-600 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> Shortages:
                </p>
                {rec.shortages.map(s => (
                  <div key={s.name} className="text-xs text-gray-600 flex justify-between bg-red-50 rounded px-2 py-1">
                    <span>{s.name}</span>
                    <span className="text-red-500">Need {s.need} {s.unit}, have {s.have} {s.unit}</span>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => sendToPrep(rec)}
              disabled={!rec.primary_ingredient_id}
              className="btn-secondary w-full text-xs py-2 flex items-center justify-center gap-1.5 disabled:opacity-40"
            >
              Send to Prep <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}

        {recommendations.length === 0 && (
          <div className="col-span-full card p-12 text-center text-gray-400">
            <ChefHat className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No recommendations yet</p>
            <p className="text-sm mt-1">Complete some orders so the system can learn your sales patterns</p>
          </div>
        )}
      </div>
    </div>
  )
}
