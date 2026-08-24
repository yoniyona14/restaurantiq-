'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, cn } from '@/lib/utils'
import { HealthInsight, HealthSeverity } from '@/types/enterprise'
import { AlertTriangle, CheckCircle2, AlertCircle, Info, RefreshCw, ExternalLink } from 'lucide-react'
import Link from 'next/link'

const SEVERITY_STYLES: Record<HealthSeverity, { bg: string; border: string; icon: string; badge: string }> = {
  critical: { bg: 'bg-red-50',     border: 'border-red-200',    icon: 'text-red-500',    badge: 'bg-red-100 text-red-700' },
  warning:  { bg: 'bg-amber-50',   border: 'border-amber-200',  icon: 'text-amber-500',  badge: 'bg-amber-100 text-amber-700' },
  info:     { bg: 'bg-blue-50',    border: 'border-blue-200',   icon: 'text-blue-500',   badge: 'bg-blue-100 text-blue-700' },
  positive: { bg: 'bg-emerald-50', border: 'border-emerald-200',icon: 'text-emerald-500',badge: 'bg-emerald-100 text-emerald-700' },
}

const SEVERITY_ICONS = { critical: AlertTriangle, warning: AlertCircle, info: Info, positive: CheckCircle2 }

export default function HealthPage() {
  const supabase = createClient()
  const [insights, setInsights] = useState<HealthInsight[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [score, setScore] = useState(0)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  useEffect(() => { analyze() }, [])

  async function analyze() {
    setRefreshing(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase.from('users').select('restaurant_id').eq('id', user!.id).single()
      const rid = profile!.restaurant_id
      const now = new Date()
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString()

      // Fetch each dataset independently — no nested subqueries
      const [
        { data: inventory },
        { data: movements },
        { data: orders },
        { data: menuItems },
        { data: purchaseOrders },
        { data: prepBatches },
      ] = await Promise.all([
        supabase.from('inventory_items').select('*').eq('restaurant_id', rid),
        supabase.from('inventory_movements').select('*').eq('restaurant_id', rid).gte('recorded_at', twoWeeksAgo),
        supabase.from('orders').select('*').eq('restaurant_id', rid).gte('created_at', twoWeeksAgo),
        supabase.from('menu_items').select('id, name, price').eq('restaurant_id', rid),
        supabase.from('purchase_orders').select('*').eq('restaurant_id', rid).gte('created_at', weekAgo),
        supabase.from('prep_batches').select('*').eq('restaurant_id', rid).gte('created_at', weekAgo),
      ])

      // Fetch recipe versions separately
      const menuItemIds = (menuItems ?? []).map(m => m.id)
      const { data: recipeVersions } = menuItemIds.length > 0
        ? await supabase.from('recipe_versions')
            .select('id, menu_item_id, is_current, recipe_ingredients(quantity, waste_percentage, yield_percentage, inventory_items(id, unit_cost, name))')
            .eq('is_current', true)
            .in('menu_item_id', menuItemIds)
        : { data: [] }

      const generatedInsights: HealthInsight[] = []

      // ─── INVENTORY HEALTH ─────────────────────────────────────────
      const lowStock = (inventory ?? []).filter(i => i.current_stock <= i.reorder_level)
      if (lowStock.length > 0) {
        generatedInsights.push({
          id: 'low-stock',
          title: `${lowStock.length} ingredient${lowStock.length > 1 ? 's' : ''} below reorder level`,
          severity: lowStock.length >= 3 ? 'critical' : 'warning',
          category: 'inventory',
          impact: `Risk of stockouts affecting ${lowStock.length} ingredient${lowStock.length > 1 ? 's' : ''}`,
          why: 'Current stock fell below the reorder threshold you set',
          metric: lowStock.map(i => `${i.name}: ${i.current_stock} ${i.unit}`).join(', '),
          action: 'Create a purchase order to restock these items',
          link: '/dashboard/purchasing',
        })
      }

      const zeroStock = (inventory ?? []).filter(i => i.current_stock === 0)
      if (zeroStock.length > 0) {
        generatedInsights.push({
          id: 'zero-stock',
          title: `${zeroStock.length} ingredient${zeroStock.length > 1 ? 's' : ''} completely out of stock`,
          severity: 'critical',
          category: 'inventory',
          impact: 'Recipes using these ingredients cannot be prepared',
          why: 'Stock reached zero — possible stockout or missing receiving records',
          metric: zeroStock.map(i => i.name).join(', '),
          action: 'Verify physical stock and create purchase orders immediately',
          link: '/dashboard/inventory',
        })
      }

      // ─── WASTE HEALTH ─────────────────────────────────────────────
      const wasteMovements = (movements ?? []).filter(m => ['waste', 'spoilage', 'expired'].includes(m.reason))
      const thisWeekWaste = wasteMovements.filter(m => new Date(m.recorded_at) >= new Date(weekAgo))
      const lastWeekWaste = wasteMovements.filter(m => new Date(m.recorded_at) < new Date(weekAgo))
      const thisWasteCost = thisWeekWaste.reduce((s, m) => s + (m.total_cost ?? 0), 0)
      const lastWasteCost = lastWeekWaste.reduce((s, m) => s + (m.total_cost ?? 0), 0)

      if (thisWasteCost > 0) {
        const wasteChange = lastWasteCost > 0 ? ((thisWasteCost - lastWasteCost) / lastWasteCost) * 100 : 0
        generatedInsights.push({
          id: 'waste-cost',
          title: `Waste cost this week: ${formatCurrency(thisWasteCost)}`,
          severity: wasteChange > 20 ? 'critical' : wasteChange > 0 ? 'warning' : 'info',
          category: 'waste',
          impact: `${formatCurrency(thisWasteCost)} in inventory written off this week`,
          why: wasteChange > 0 ? `Waste increased by ${wasteChange.toFixed(0)}% vs last week` : 'Waste is tracked and under control',
          metric: `This week: ${formatCurrency(thisWasteCost)} · Last week: ${formatCurrency(lastWasteCost)}`,
          action: wasteChange > 20 ? 'Investigate which ingredients are being wasted and adjust ordering' : 'Continue monitoring waste patterns',
          link: '/dashboard/inventory',
        })
      }

      // ─── PROFITABILITY ────────────────────────────────────────────
      const highFoodCostItems: string[] = []
      ;(menuItems ?? []).forEach(item => {
        const version = (recipeVersions ?? []).find(v => v.menu_item_id === item.id)
        if (!version || !item.price) return
        const cost = (version.recipe_ingredients ?? []).reduce((s: number, ing: any) => {
          const unitCost = ing.inventory_items?.unit_cost ?? 0
          const waste = (ing.waste_percentage ?? 0) / 100
          const yld = (ing.yield_percentage ?? 100) / 100
          return s + ((Number(ing.quantity) * (1 + waste)) / yld) * unitCost
        }, 0)
        const pct = (cost / item.price) * 100
        if (pct > 35) highFoodCostItems.push(`${item.name} (${pct.toFixed(1)}%)`)
      })

      if (highFoodCostItems.length > 0) {
        generatedInsights.push({
          id: 'high-food-cost',
          title: `${highFoodCostItems.length} recipe${highFoodCostItems.length > 1 ? 's' : ''} with food cost above 35%`,
          severity: 'warning',
          category: 'profitability',
          impact: 'These dishes are eating into your profit margins',
          why: 'Industry standard food cost target is 25–35%. Above 35% means low profitability.',
          metric: highFoodCostItems.join(', '),
          action: 'Review portion sizes, ingredient costs, or increase selling price',
          link: '/dashboard/recipes',
        })
      }

      // ─── REVENUE TREND ────────────────────────────────────────────
      const thisWeekOrders = (orders ?? []).filter(o => o.status === 'completed' && new Date(o.created_at) >= new Date(weekAgo))
      const lastWeekOrders = (orders ?? []).filter(o => o.status === 'completed' && new Date(o.created_at) < new Date(weekAgo))
      const thisRevenue = thisWeekOrders.reduce((s, o) => s + o.total, 0)
      const lastRevenue = lastWeekOrders.reduce((s, o) => s + o.total, 0)

      if (lastRevenue > 0) {
        const revenueChange = ((thisRevenue - lastRevenue) / lastRevenue) * 100
        if (Math.abs(revenueChange) > 10) {
          generatedInsights.push({
            id: 'revenue-trend',
            title: `Revenue ${revenueChange > 0 ? 'up' : 'down'} ${Math.abs(revenueChange).toFixed(0)}% vs last week`,
            severity: revenueChange > 0 ? 'positive' : revenueChange < -20 ? 'critical' : 'warning',
            category: 'profitability',
            impact: `${formatCurrency(Math.abs(thisRevenue - lastRevenue))} ${revenueChange > 0 ? 'more' : 'less'} than last week`,
            why: revenueChange > 0 ? 'Strong sales performance this week' : 'Sales declined compared to last week',
            metric: `This week: ${formatCurrency(thisRevenue)} · Last week: ${formatCurrency(lastRevenue)}`,
            action: revenueChange > 0 ? 'Identify what drove growth and replicate it' : 'Review staffing, menu availability, and marketing',
            link: '/dashboard',
          })
        }
      }

      // ─── PURCHASING ───────────────────────────────────────────────
      const stalePOs = (purchaseOrders ?? []).filter(po => {
        const age = (now.getTime() - new Date(po.created_at).getTime()) / (1000 * 60 * 60 * 24)
        return ['draft', 'submitted'].includes(po.status) && age > 3
      })
      if (stalePOs.length > 0) {
        generatedInsights.push({
          id: 'stale-pos',
          title: `${stalePOs.length} purchase order${stalePOs.length > 1 ? 's' : ''} pending over 3 days`,
          severity: 'warning',
          category: 'purchasing',
          impact: 'Delayed ordering may cause stockouts',
          why: 'Purchase orders have not been approved or received in a timely manner',
          metric: stalePOs.map(po => po.po_number).join(', '),
          action: 'Review and advance these purchase orders',
          link: '/dashboard/purchasing',
        })
      }

      // ─── RECIPE HEALTH ────────────────────────────────────────────
      const noRecipe = (menuItems ?? []).filter(item =>
        !(recipeVersions ?? []).some(v => v.menu_item_id === item.id)
      )
      if (noRecipe.length > 0) {
        generatedInsights.push({
          id: 'no-recipe',
          title: `${noRecipe.length} menu item${noRecipe.length > 1 ? 's' : ''} have no recipe`,
          severity: 'info',
          category: 'recipe',
          impact: 'Inventory cannot be auto-deducted for these items when orders complete',
          why: 'No recipe version exists — ingredients and costs are unknown',
          metric: noRecipe.slice(0, 5).map(i => i.name).join(', ') + (noRecipe.length > 5 ? '…' : ''),
          action: 'Build recipes so ingredient costs are tracked automatically',
          link: '/dashboard/recipes',
        })
      }

      // ─── PREP BATCH HEALTH ────────────────────────────────────────
      const lowYieldBatches = (prepBatches ?? []).filter(b => b.yield_percentage < 80)
      if (lowYieldBatches.length > 0) {
        generatedInsights.push({
          id: 'low-yield',
          title: `${lowYieldBatches.length} prep batch${lowYieldBatches.length > 1 ? 'es' : ''} with yield below 80%`,
          severity: 'warning',
          category: 'waste',
          impact: 'High prep waste is increasing your effective ingredient costs',
          why: 'Usable output was significantly less than raw input',
          metric: lowYieldBatches.map(b => `${b.batch_number}: ${b.yield_percentage.toFixed(0)}%`).join(', '),
          action: 'Review prep procedures and train staff on yield improvement',
          link: '/dashboard/prep-batches',
        })
      }

      // ─── POSITIVES ────────────────────────────────────────────────
      if (lowStock.length === 0 && zeroStock.length === 0) {
        generatedInsights.push({
          id: 'stock-healthy',
          title: 'All inventory levels are healthy',
          severity: 'positive',
          category: 'inventory',
          impact: 'No stockout risk detected',
          why: 'All ingredients are above their reorder thresholds',
          action: 'Continue monitoring — review reorder levels monthly',
          link: '/dashboard/inventory',
        })
      }

      if (thisRevenue > 0 && thisRevenue >= lastRevenue) {
        generatedInsights.push({
          id: 'revenue-positive',
          title: `Revenue on track — ${formatCurrency(thisRevenue)} this week`,
          severity: 'positive',
          category: 'profitability',
          impact: 'Business is performing well',
          why: "This week's revenue matches or exceeds last week",
          action: 'Keep up the momentum',
          link: '/dashboard',
        })
      }

      // ─── SCORE ────────────────────────────────────────────────────
      const criticalCount = generatedInsights.filter(i => i.severity === 'critical').length
      const warningCount  = generatedInsights.filter(i => i.severity === 'warning').length
      const positiveCount = generatedInsights.filter(i => i.severity === 'positive').length
      const calculatedScore = Math.max(0, Math.min(100, 100 - criticalCount * 20 - warningCount * 8 + positiveCount * 3))

      const order: Record<HealthSeverity, number> = { critical: 0, warning: 1, info: 2, positive: 3 }
      generatedInsights.sort((a, b) => order[a.severity] - order[b.severity])

      setInsights(generatedInsights)
      setScore(calculatedScore)
      setLastUpdated(new Date())
    } catch (err) {
      console.error('Health analysis error:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const scoreColor = score >= 80 ? 'text-emerald-600' : score >= 60 ? 'text-amber-600' : 'text-red-600'
  const scoreRing  = score >= 80 ? 'stroke-emerald-500' : score >= 60 ? 'stroke-amber-500' : 'stroke-red-500'
  const criticals  = insights.filter(i => i.severity === 'critical')
  const warnings   = insights.filter(i => i.severity === 'warning')
  const positives  = insights.filter(i => i.severity === 'positive')
  const infos      = insights.filter(i => i.severity === 'info')

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-400">
      <RefreshCw className="w-6 h-6 animate-spin" />
      <p className="text-sm">Analyzing your business…</p>
    </div>
  )

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Business Health Center</h1>
          <p className="text-sm text-gray-500">{lastUpdated ? `Last analyzed ${lastUpdated.toLocaleTimeString()}` : 'Real-time operational intelligence'}</p>
        </div>
        <button onClick={analyze} disabled={refreshing} className="btn-secondary text-sm py-2 px-4 disabled:opacity-50">
          <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="card p-6 flex items-center gap-5">
          <div className="relative flex-shrink-0">
            <svg className="w-20 h-20 -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f3f4f6" strokeWidth="3" />
              <circle cx="18" cy="18" r="15.9" fill="none" className={scoreRing} strokeWidth="3"
                strokeDasharray={`${score} 100`} strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={cn('text-xl font-bold', scoreColor)}>{score}</span>
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">Business score</p>
            <p className="text-xs text-gray-500 mt-0.5">{score >= 80 ? 'Excellent' : score >= 60 ? 'Needs attention' : 'Critical issues'}</p>
          </div>
        </div>
        <div className="kpi-card"><span className="kpi-label text-red-600">Critical</span><p className="kpi-value text-red-600">{criticals.length}</p></div>
        <div className="kpi-card"><span className="kpi-label text-amber-600">Warnings</span><p className="kpi-value text-amber-600">{warnings.length}</p></div>
        <div className="kpi-card"><span className="kpi-label text-emerald-600">Positives</span><p className="kpi-value text-emerald-600">{positives.length}</p></div>
      </div>

      {[
        { label: 'Critical — Needs immediate action', items: criticals },
        { label: 'Warnings — Review soon',            items: warnings },
        { label: 'Info — For your awareness',         items: infos },
        { label: "Positive — What's working",         items: positives },
      ].map(section => section.items.length > 0 && (
        <div key={section.label}>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">{section.label}</h2>
          <div className="space-y-3">
            {section.items.map(insight => {
              const styles = SEVERITY_STYLES[insight.severity]
              const Icon = SEVERITY_ICONS[insight.severity]
              return (
                <div key={insight.id} className={cn('rounded-xl border p-4', styles.bg, styles.border)}>
                  <div className="flex items-start gap-3">
                    <Icon className={cn('w-5 h-5 flex-shrink-0 mt-0.5', styles.icon)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="font-medium text-gray-900 text-sm">{insight.title}</p>
                        <span className={cn('badge capitalize text-xs', styles.badge)}>{insight.category.replace('_', ' ')}</span>
                      </div>
                      <p className="text-xs text-gray-600 mb-1"><span className="font-medium">Impact:</span> {insight.impact}</p>
                      <p className="text-xs text-gray-500 mb-1"><span className="font-medium">Why:</span> {insight.why}</p>
                      {insight.metric && <p className="text-xs text-gray-500 mb-2 font-mono bg-white/60 rounded px-2 py-1 mt-1">{insight.metric}</p>}
                      <div className="flex items-center justify-between gap-2 mt-2">
                        <p className="text-xs text-gray-700"><span className="font-medium">Action:</span> {insight.action}</p>
                        {insight.link && (
                          <Link href={insight.link} className="flex items-center gap-1 text-xs text-brand-600 hover:underline whitespace-nowrap flex-shrink-0">
                            Investigate <ExternalLink className="w-3 h-3" />
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {insights.length === 0 && (
        <div className="card p-12 text-center">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
          <p className="font-medium text-gray-900">Everything looks great</p>
          <p className="text-sm text-gray-500 mt-1">No issues detected. Keep up the excellent work.</p>
        </div>
      )}
    </div>
  )
}
