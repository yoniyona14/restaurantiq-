'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { createClient } from '@/lib/supabase/client'
import { subDays, startOfDay, format } from 'date-fns'
import { formatCurrency, percentChange, PAYMENT_LABELS, cn } from '@/lib/utils'
import { TrendingUp, PackageX, Truck } from 'lucide-react'
import KpiCard from '@/components/dashboard/analytics/KpiCard'
import DrillDownPanel, { type DrillDownData } from '@/components/dashboard/analytics/DrillDownPanel'

type Period = 7 | 30 | 90

interface OrderRow {
  id: string
  total: number
  created_at: string
  payments: { method: string }[] | null
}

interface OrderItemRow {
  id: string
  order_id: string
  menu_item_id: string
  quantity: number
  subtotal: number
  recipe_version_id: string | null
  orders: { created_at: string } | null
  menu_items: { name: string; menu_categories: { name: string } | null } | null
}

interface RecipeVersionRow {
  id: string
  menu_item_id: string
  is_current: boolean
  recipe_ingredients: { quantity: number; inventory_items: { unit_cost: number | null } | null }[] | null
}

interface WasteMovementRow {
  id: string
  inventory_id: string
  reason: string
  quantity: number
  unit_cost: number | null
  total_cost: number | null
  recorded_at: string
  inventory_items: { name: string } | null
}

interface PurchaseMovementRow {
  inventory_id: string
  unit_cost: number | null
  recorded_at: string
  inventory_items: { name: string } | null
}

interface PrepBatchRow {
  id: string
  batch_number: string
  inventory_id: string
  date: string
  waste_quantity: number
  inventory_items: { name: string; unit_cost: number | null } | null
}

interface PurchaseOrderRow {
  id: string
  po_number: string
  supplier_id: string | null
  status: string
  expected_delivery: string | null
  received_at: string | null
  total: number
  created_at: string
  suppliers: { name: string } | null
}

const dayKey = (d: string | Date) => format(new Date(d), 'yyyy-MM-dd')

export default function AnalyticsPage() {
  const supabase = createClient()
  const [period, setPeriod] = useState<Period>(30)
  const [loading, setLoading] = useState(true)
  const [drilldown, setDrilldown] = useState<DrillDownData | null>(null)

  const [orders, setOrders] = useState<OrderRow[]>([])
  const [orderItems, setOrderItems] = useState<OrderItemRow[]>([])
  const [recipeVersions, setRecipeVersions] = useState<RecipeVersionRow[]>([])
  const [wasteMovements, setWasteMovements] = useState<WasteMovementRow[]>([])
  const [purchaseMovements, setPurchaseMovements] = useState<PurchaseMovementRow[]>([])
  const [prepBatches, setPrepBatches] = useState<PrepBatchRow[]>([])
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderRow[]>([])

  const now = useMemo(() => new Date(), [])
  const currentStart = useMemo(() => startOfDay(subDays(now, period - 1)), [now, period])
  const previousStart = useMemo(() => startOfDay(subDays(currentStart, period)), [currentStart, period])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data: profile } = await supabase.from('users').select('restaurant_id').single()
      const rid = profile?.restaurant_id
      if (!rid) { setLoading(false); return }

      const rangeStart = previousStart.toISOString()
      const rangeEnd = now.toISOString()
      const rangeStartDate = format(previousStart, 'yyyy-MM-dd')
      const rangeEndDate = format(now, 'yyyy-MM-dd')

      const [ordersRes, itemsRes, recipesRes, wasteRes, purchaseMoveRes, prepRes, poRes] = await Promise.all([
        supabase.from('orders')
          .select('id, total, created_at, payments(method)')
          .eq('restaurant_id', rid).eq('status', 'completed')
          .gte('created_at', rangeStart).lte('created_at', rangeEnd),
        supabase.from('order_items')
          .select('id, order_id, menu_item_id, quantity, subtotal, recipe_version_id, orders!inner(created_at, status, restaurant_id), menu_items(name, menu_categories(name))')
          .eq('orders.restaurant_id', rid).eq('orders.status', 'completed')
          .gte('orders.created_at', rangeStart).lte('orders.created_at', rangeEnd),
        supabase.from('recipe_versions')
          .select('id, menu_item_id, is_current, menu_items!inner(restaurant_id), recipe_ingredients(quantity, inventory_items(unit_cost))')
          .eq('menu_items.restaurant_id', rid),
        supabase.from('inventory_movements')
          .select('id, inventory_id, reason, quantity, unit_cost, total_cost, recorded_at, inventory_items(name)')
          .eq('restaurant_id', rid).in('reason', ['waste', 'spoilage', 'expired'])
          .gte('recorded_at', rangeStart).lte('recorded_at', rangeEnd),
        supabase.from('inventory_movements')
          .select('inventory_id, unit_cost, recorded_at, inventory_items(name)')
          .eq('restaurant_id', rid).eq('reason', 'purchase')
          .gte('recorded_at', rangeStart).lte('recorded_at', rangeEnd),
        supabase.from('prep_batches')
          .select('id, batch_number, inventory_id, date, waste_quantity, inventory_items(name, unit_cost)')
          .eq('restaurant_id', rid)
          .gte('date', rangeStartDate).lte('date', rangeEndDate),
        supabase.from('purchase_orders')
          .select('id, po_number, supplier_id, status, expected_delivery, received_at, total, created_at, suppliers(name)')
          .eq('restaurant_id', rid)
          .gte('created_at', rangeStart).lte('created_at', rangeEnd),
      ])

      setOrders((ordersRes.data as any) ?? [])
      setOrderItems((itemsRes.data as any) ?? [])
      setRecipeVersions((recipesRes.data as any) ?? [])
      setWasteMovements((wasteRes.data as any) ?? [])
      setPurchaseMovements((purchaseMoveRes.data as any) ?? [])
      setPrepBatches((prepRes.data as any) ?? [])
      setPurchaseOrders((poRes.data as any) ?? [])
      setLoading(false)
    }
    load()
  }, [period])

  // ---------- cost lookup maps ----------
  const { costByVersion, costByMenuItemCurrent } = useMemo(() => {
    const byVersion = new Map<string, number>()
    const byMenuItemCurrent = new Map<string, number>()
    for (const rv of recipeVersions) {
      const cost = (rv.recipe_ingredients ?? []).reduce(
        (s, ri) => s + ri.quantity * (ri.inventory_items?.unit_cost ?? 0), 0
      )
      byVersion.set(rv.id, cost)
      if (rv.is_current) byMenuItemCurrent.set(rv.menu_item_id, cost)
    }
    return { costByVersion: byVersion, costByMenuItemCurrent: byMenuItemCurrent }
  }, [recipeVersions])

  const itemCost = (oi: OrderItemRow) => {
    const perUnit = oi.recipe_version_id ? costByVersion.get(oi.recipe_version_id) : undefined
    const unitCost = perUnit ?? costByMenuItemCurrent.get(oi.menu_item_id) ?? 0
    return unitCost * oi.quantity
  }

  const inCurrent = (iso: string) => new Date(iso) >= currentStart
  const inPrevious = (iso: string) => new Date(iso) >= previousStart && new Date(iso) < currentStart

  // ---------- day buckets ----------
  const currentDays = useMemo(
    () => Array.from({ length: period }, (_, i) => startOfDay(subDays(now, period - 1 - i))),
    [now, period]
  )
  const previousDays = useMemo(
    () => Array.from({ length: period }, (_, i) => startOfDay(subDays(currentStart, period - i))),
    [currentStart, period]
  )

  // ---------- revenue & profit ----------
  const revenueByDay = useMemo(() => {
    const m = new Map<string, number>()
    for (const o of orders) m.set(dayKey(o.created_at), (m.get(dayKey(o.created_at)) ?? 0) + Number(o.total))
    return m
  }, [orders])

  const costByDay = useMemo(() => {
    const m = new Map<string, number>()
    for (const oi of orderItems) {
      const k = dayKey(oi.orders!.created_at)
      m.set(k, (m.get(k) ?? 0) + itemCost(oi))
    }
    return m
  }, [orderItems, costByVersion, costByMenuItemCurrent])

  const revenueCurrent = orders.filter(o => inCurrent(o.created_at)).reduce((s, o) => s + Number(o.total), 0)
  const revenuePrevious = orders.filter(o => inPrevious(o.created_at)).reduce((s, o) => s + Number(o.total), 0)
  const ordersCountCurrent = orders.filter(o => inCurrent(o.created_at)).length
  const ordersCountPrevious = orders.filter(o => inPrevious(o.created_at)).length
  const cogsCurrent = orderItems.filter(oi => inCurrent(oi.orders!.created_at)).reduce((s, oi) => s + itemCost(oi), 0)
  const cogsPrevious = orderItems.filter(oi => inPrevious(oi.orders!.created_at)).reduce((s, oi) => s + itemCost(oi), 0)
  const grossProfitCurrent = revenueCurrent - cogsCurrent
  const grossProfitPrevious = revenuePrevious - cogsPrevious
  const marginCurrent = revenueCurrent ? (grossProfitCurrent / revenueCurrent) * 100 : 0
  const marginPrevious = revenuePrevious ? (grossProfitPrevious / revenuePrevious) * 100 : 0
  const foodCostCurrent = revenueCurrent ? (cogsCurrent / revenueCurrent) * 100 : 0
  const foodCostPrevious = revenuePrevious ? (cogsPrevious / revenuePrevious) * 100 : 0
  const aovCurrent = ordersCountCurrent ? revenueCurrent / ordersCountCurrent : 0
  const aovPrevious = ordersCountPrevious ? revenuePrevious / ordersCountPrevious : 0

  const revenueTrend = useMemo(() => currentDays.map((d, i) => {
    const curKey = dayKey(d)
    const prevKey = dayKey(previousDays[i])
    return {
      date: format(d, 'MMM d'),
      dateKey: curKey,
      revenue: Math.round(revenueByDay.get(curKey) ?? 0),
      prevRevenue: Math.round(revenueByDay.get(prevKey) ?? 0),
    }
  }), [currentDays, previousDays, revenueByDay])

  const foodCostTrend = useMemo(() => currentDays.map(d => {
    const k = dayKey(d)
    const rev = revenueByDay.get(k) ?? 0
    const cost = costByDay.get(k) ?? 0
    return { date: format(d, 'MMM d'), foodCostPct: rev ? Math.round((cost / rev) * 1000) / 10 : 0 }
  }), [currentDays, revenueByDay, costByDay])

  const categoryStats = useMemo(() => {
    const m = new Map<string, { revenue: number; cost: number; units: number }>()
    for (const oi of orderItems) {
      if (!inCurrent(oi.orders!.created_at)) continue
      const cat = oi.menu_items?.menu_categories?.name ?? 'Uncategorized'
      const cur = m.get(cat) ?? { revenue: 0, cost: 0, units: 0 }
      cur.revenue += Number(oi.subtotal)
      cur.cost += itemCost(oi)
      cur.units += Number(oi.quantity)
      m.set(cat, cur)
    }
    return Array.from(m.entries())
      .map(([name, v]) => ({ name, ...v, margin: v.revenue ? ((v.revenue - v.cost) / v.revenue) * 100 : 0 }))
      .sort((a, b) => b.revenue - a.revenue)
  }, [orderItems, costByVersion, costByMenuItemCurrent, currentStart])

  // ---------- waste ----------
  const wasteCostOf = (m: WasteMovementRow) => m.total_cost ?? Math.abs(Number(m.quantity)) * (m.unit_cost ?? 0)
  const prepWasteCostOf = (p: PrepBatchRow) => Number(p.waste_quantity) * (p.inventory_items?.unit_cost ?? 0)

  const wasteByDay = useMemo(() => {
    const m = new Map<string, number>()
    for (const w of wasteMovements) { const k = dayKey(w.recorded_at); m.set(k, (m.get(k) ?? 0) + wasteCostOf(w)) }
    for (const p of prepBatches) { const k = dayKey(p.date); m.set(k, (m.get(k) ?? 0) + prepWasteCostOf(p)) }
    return m
  }, [wasteMovements, prepBatches])

  const wasteTrend = useMemo(() => currentDays.map(d => {
    const k = dayKey(d)
    return { date: format(d, 'MMM d'), dateKey: k, waste: Math.round(wasteByDay.get(k) ?? 0) }
  }), [currentDays, wasteByDay])

  const wasteCurrentTotal = currentDays.reduce((s, d) => s + (wasteByDay.get(dayKey(d)) ?? 0), 0)
  const wastePreviousTotal = previousDays.reduce((s, d) => s + (wasteByDay.get(dayKey(d)) ?? 0), 0)

  const topWastedIngredients = useMemo(() => {
    const m = new Map<string, { name: string; cost: number }>()
    for (const w of wasteMovements) {
      if (!inCurrent(w.recorded_at)) continue
      const name = w.inventory_items?.name ?? 'Unknown'
      const cur = m.get(w.inventory_id) ?? { name, cost: 0 }
      cur.cost += wasteCostOf(w)
      m.set(w.inventory_id, cur)
    }
    for (const p of prepBatches) {
      if (!inCurrent(p.date)) continue
      const name = p.inventory_items?.name ?? 'Unknown'
      const cur = m.get(p.inventory_id) ?? { name, cost: 0 }
      cur.cost += prepWasteCostOf(p)
      m.set(p.inventory_id, cur)
    }
    return Array.from(m.entries()).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.cost - a.cost).slice(0, 8)
  }, [wasteMovements, prepBatches, currentStart])

  // ---------- supplier / purchasing ----------
  const supplierSpend = useMemo(() => {
    const m = new Map<string, number>()
    for (const po of purchaseOrders) {
      if (!inCurrent(po.created_at) || po.status === 'cancelled') continue
      const name = po.suppliers?.name ?? 'Unknown supplier'
      m.set(name, (m.get(name) ?? 0) + Number(po.total))
    }
    return Array.from(m.entries()).map(([supplier, spend]) => ({ supplier, spend: Math.round(spend) })).sort((a, b) => b.spend - a.spend)
  }, [purchaseOrders, currentStart])

  const poSpendCurrent = purchaseOrders.filter(po => inCurrent(po.created_at) && po.status !== 'cancelled').reduce((s, po) => s + Number(po.total), 0)
  const poSpendPrevious = purchaseOrders.filter(po => inPrevious(po.created_at) && po.status !== 'cancelled').reduce((s, po) => s + Number(po.total), 0)

  const onTimeRate = (predicate: (iso: string) => boolean) => {
    const received = purchaseOrders.filter(po => predicate(po.created_at) && po.status === 'received' && po.expected_delivery && po.received_at)
    if (!received.length) return null
    const onTime = received.filter(po => new Date(po.received_at!) <= new Date(po.expected_delivery! + 'T23:59:59'))
    return (onTime.length / received.length) * 100
  }
  const onTimeCurrent = onTimeRate(inCurrent)
  const onTimePrevious = onTimeRate(inPrevious)

  const risingCostIngredients = useMemo(() => {
    const cur = new Map<string, { name: string; sum: number; n: number }>()
    const prev = new Map<string, { name: string; sum: number; n: number }>()
    for (const m of purchaseMovements) {
      if (m.unit_cost == null) continue
      const name = m.inventory_items?.name ?? 'Unknown'
      const target = inCurrent(m.recorded_at) ? cur : inPrevious(m.recorded_at) ? prev : null
      if (!target) continue
      const e = target.get(m.inventory_id) ?? { name, sum: 0, n: 0 }
      e.sum += Number(m.unit_cost); e.n += 1
      target.set(m.inventory_id, e)
    }
    const rows: { id: string; name: string; prevAvg: number; curAvg: number; pct: number }[] = []
    for (const [id, c] of cur.entries()) {
      const p = prev.get(id)
      if (!p) continue
      const curAvg = c.sum / c.n, prevAvg = p.sum / p.n
      if (prevAvg <= 0) continue
      const pct = ((curAvg - prevAvg) / prevAvg) * 100
      if (pct > 5) rows.push({ id, name: c.name, prevAvg, curAvg, pct })
    }
    return rows.sort((a, b) => b.pct - a.pct).slice(0, 8)
  }, [purchaseMovements, currentStart])

  // ---------- drill-down builders ----------
  function showOrdersForDay(dateKeyStr: string) {
    const rows = orders
      .filter(o => dayKey(o.created_at) === dateKeyStr)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .map(o => ({
        id: o.id.slice(0, 8),
        time: format(new Date(o.created_at), 'h:mm a'),
        payment: o.payments?.[0] ? (PAYMENT_LABELS[o.payments[0].method] ?? o.payments[0].method) : '—',
        total: formatCurrency(Number(o.total)),
      }))
    setDrilldown({
      title: `Orders on ${format(new Date(dateKeyStr), 'MMM d, yyyy')}`,
      subtitle: `${rows.length} completed orders`,
      columns: [{ key: 'id', label: 'Order' }, { key: 'time', label: 'Time' }, { key: 'payment', label: 'Payment' }, { key: 'total', label: 'Total', align: 'right' }],
      rows,
    })
  }

  function showCategoryItems(categoryName: string) {
    const m = new Map<string, { revenue: number; cost: number; units: number }>()
    for (const oi of orderItems) {
      if (!inCurrent(oi.orders!.created_at)) continue
      const cat = oi.menu_items?.menu_categories?.name ?? 'Uncategorized'
      if (cat !== categoryName) continue
      const name = oi.menu_items?.name ?? 'Unknown item'
      const cur = m.get(name) ?? { revenue: 0, cost: 0, units: 0 }
      cur.revenue += Number(oi.subtotal); cur.cost += itemCost(oi); cur.units += Number(oi.quantity)
      m.set(name, cur)
    }
    const rows = Array.from(m.entries())
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .map(([name, v]) => ({ name, units: v.units, revenue: formatCurrency(v.revenue), margin: `${v.revenue ? Math.round(((v.revenue - v.cost) / v.revenue) * 100) : 0}%` }))
    setDrilldown({
      title: categoryName,
      subtitle: `${rows.length} menu items sold this period`,
      columns: [{ key: 'name', label: 'Item' }, { key: 'units', label: 'Units', align: 'right' }, { key: 'revenue', label: 'Revenue', align: 'right' }, { key: 'margin', label: 'Margin', align: 'right' }],
      rows,
    })
  }

  function showWasteForIngredient(id: string, name: string) {
    const rows = [
      ...wasteMovements.filter(w => w.inventory_id === id && inCurrent(w.recorded_at)).map(w => ({
        date: format(new Date(w.recorded_at), 'MMM d'), source: w.reason, qty: Number(w.quantity).toFixed(2), cost: formatCurrency(wasteCostOf(w)),
      })),
      ...prepBatches.filter(p => p.inventory_id === id && inCurrent(p.date)).map(p => ({
        date: format(new Date(p.date), 'MMM d'), source: `prep (${p.batch_number})`, qty: Number(p.waste_quantity).toFixed(2), cost: formatCurrency(prepWasteCostOf(p)),
      })),
    ].sort((a, b) => a.date.localeCompare(b.date))
    setDrilldown({
      title: name,
      subtitle: `${rows.length} waste records this period`,
      columns: [{ key: 'date', label: 'Date' }, { key: 'source', label: 'Source' }, { key: 'qty', label: 'Qty', align: 'right' }, { key: 'cost', label: 'Cost', align: 'right' }],
      rows,
    })
  }

  function showSupplierPOs(supplierName: string) {
    const rows = purchaseOrders
      .filter(po => (po.suppliers?.name ?? 'Unknown supplier') === supplierName && inCurrent(po.created_at))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .map(po => ({
        po: po.po_number,
        status: po.status,
        expected: po.expected_delivery ? format(new Date(po.expected_delivery), 'MMM d') : '—',
        received: po.received_at ? format(new Date(po.received_at), 'MMM d') : '—',
        total: formatCurrency(Number(po.total)),
      }))
    setDrilldown({
      title: supplierName,
      subtitle: `${rows.length} purchase orders this period`,
      columns: [{ key: 'po', label: 'PO #' }, { key: 'status', label: 'Status' }, { key: 'expected', label: 'Expected' }, { key: 'received', label: 'Received' }, { key: 'total', label: 'Total', align: 'right' }],
      rows,
    })
  }

  function showIngredientPurchases(id: string, name: string) {
    const rows = purchaseMovements
      .filter(m => m.inventory_id === id)
      .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())
      .map(m => ({ date: format(new Date(m.recorded_at), 'MMM d'), unitCost: formatCurrency(Number(m.unit_cost ?? 0)) }))
    setDrilldown({
      title: name,
      subtitle: 'Unit cost per purchase, oldest to newest',
      columns: [{ key: 'date', label: 'Date' }, { key: 'unitCost', label: 'Unit Cost', align: 'right' }],
      rows,
    })
  }

  const maxWaste = Math.max(1, ...topWastedIngredients.map(i => i.cost))

  if (loading) {
    return <div className="flex items-center justify-center h-96 text-sm text-gray-400">Loading analytics…</div>
  }

  return (
    <div className="space-y-8 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Analytics</h1>
          <p className="text-sm text-gray-500 mt-0.5">Revenue, margins and cost trends — click any chart or row to drill in</p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {([7, 30, 90] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn('px-3 py-1.5 text-xs font-medium rounded-md transition-colors', period === p ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}
            >
              {p}d
            </button>
          ))}
        </div>
      </div>

      {/* ---------------- SECTION 1: REVENUE & PROFIT ---------------- */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5"><TrendingUp className="w-4 h-4 text-brand-600" /> Revenue &amp; Profit</h2>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiCard label="Revenue" value={formatCurrency(revenueCurrent)} deltaPct={percentChange(revenueCurrent, revenuePrevious)} />
          <KpiCard label="COGS" value={formatCurrency(cogsCurrent)} deltaPct={percentChange(cogsCurrent, cogsPrevious)} invertGood />
          <KpiCard label="Gross Profit" value={formatCurrency(grossProfitCurrent)} deltaPct={percentChange(grossProfitCurrent, grossProfitPrevious)} />
          <KpiCard label="Gross Margin" value={`${marginCurrent.toFixed(1)}%`} deltaPct={percentChange(marginCurrent, marginPrevious)} subtext={`Food cost ${foodCostCurrent.toFixed(1)}%`} />
          <KpiCard label="Avg Order Value" value={formatCurrency(aovCurrent)} deltaPct={percentChange(aovCurrent, aovPrevious)} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card p-4">
            <p className="text-xs font-medium text-gray-500 mb-3">Revenue — this period vs. previous period (click a day for its orders)</p>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={revenueTrend} onClick={(e: any) => { const p = e?.activePayload?.[0]?.payload; if (p) showOrdersForDay(p.dateKey) }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={period > 30 ? Math.floor(period / 10) : 'preserveStartEnd'} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} cursor={{ fill: '#f9fafb' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="revenue" name="Current" stroke="#2563eb" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="prevRevenue" name="Previous" stroke="#9ca3af" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="card p-4">
            <p className="text-xs font-medium text-gray-500 mb-3">Food cost % trend (COGS ÷ revenue, per day)</p>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={foodCostTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={period > 30 ? Math.floor(period / 10) : 'preserveStartEnd'} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={(v: number) => `${v}%`} />
                <Line type="monotone" dataKey="foodCostPct" name="Food cost %" stroke="#ea580c" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-4">
          <p className="text-xs font-medium text-gray-500 mb-3">Revenue by category (click a row for item-level margin)</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-gray-500 uppercase tracking-wide border-b border-gray-100">
                <th className="pb-2 font-medium">Category</th>
                <th className="pb-2 font-medium text-right">Units</th>
                <th className="pb-2 font-medium text-right">Revenue</th>
                <th className="pb-2 font-medium text-right">COGS</th>
                <th className="pb-2 font-medium text-right">Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {categoryStats.map(c => (
                <tr key={c.name} className="cursor-pointer hover:bg-gray-50" onClick={() => showCategoryItems(c.name)}>
                  <td className="py-2 text-gray-800">{c.name}</td>
                  <td className="py-2 text-right tabular-nums text-gray-600">{c.units}</td>
                  <td className="py-2 text-right tabular-nums text-gray-800">{formatCurrency(c.revenue)}</td>
                  <td className="py-2 text-right tabular-nums text-gray-500">{formatCurrency(c.cost)}</td>
                  <td className={cn('py-2 text-right tabular-nums font-medium', c.margin >= 60 ? 'text-green-600' : c.margin >= 40 ? 'text-amber-600' : 'text-red-600')}>{c.margin.toFixed(0)}%</td>
                </tr>
              ))}
              {categoryStats.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-gray-400">No sales in this period</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- SECTION 2: WASTE & SUPPLIER ---------------- */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5"><PackageX className="w-4 h-4 text-red-500" /> Waste &amp; Supplier Costs</h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Waste Value" value={formatCurrency(wasteCurrentTotal)} deltaPct={percentChange(wasteCurrentTotal, wastePreviousTotal)} invertGood />
          <KpiCard label="Supplier Spend" value={formatCurrency(poSpendCurrent)} deltaPct={percentChange(poSpendCurrent, poSpendPrevious)} />
          <KpiCard
            label="On-time Delivery"
            value={onTimeCurrent === null ? '—' : `${onTimeCurrent.toFixed(0)}%`}
            deltaPct={onTimeCurrent !== null && onTimePrevious !== null ? percentChange(onTimeCurrent, onTimePrevious) : null}
          />
          <KpiCard label="Rising-cost Ingredients" value={`${risingCostIngredients.length}`} deltaPct={null} subtext="Up >5% vs. prior period" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card p-4">
            <p className="text-xs font-medium text-gray-500 mb-3">Waste value per day (click a bar for the underlying records)</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={wasteTrend} onClick={(e: any) => { const p = e?.activePayload?.[0]?.payload; if (p) showWasteForIngredientOnDay(p.dateKey) }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={period > 30 ? Math.floor(period / 10) : 'preserveStartEnd'} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} cursor={{ fill: '#f9fafb' }} />
                <Bar dataKey="waste" name="Waste value" fill="#ef4444" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card p-4">
            <p className="text-xs font-medium text-gray-500 mb-3 flex items-center gap-1.5"><Truck className="w-3.5 h-3.5" /> Supplier spend this period (click a bar for their POs)</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={supplierSpend.slice(0, 8)} layout="vertical" margin={{ left: 8 }} onClick={(e: any) => { const p = e?.activePayload?.[0]?.payload; if (p) showSupplierPOs(p.supplier) }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <YAxis type="category" dataKey="supplier" tick={{ fontSize: 11 }} width={100} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} cursor={{ fill: '#f9fafb' }} />
                <Bar dataKey="spend" fill="#2563eb" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card p-4">
            <p className="text-xs font-medium text-gray-500 mb-3">Top wasted ingredients this period (click for records)</p>
            <div className="space-y-2">
              {topWastedIngredients.map(i => (
                <div key={i.id} className="cursor-pointer group" onClick={() => showWasteForIngredient(i.id, i.name)}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-700 group-hover:text-gray-900">{i.name}</span>
                    <span className="text-gray-500 tabular-nums">{formatCurrency(i.cost)}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-red-400 rounded-full" style={{ width: `${(i.cost / maxWaste) * 100}%` }} />
                  </div>
                </div>
              ))}
              {topWastedIngredients.length === 0 && <p className="text-sm text-gray-400 text-center py-6">No waste recorded this period</p>}
            </div>
          </div>

          <div className="card p-4">
            <p className="text-xs font-medium text-gray-500 mb-3">Ingredients with rising cost (click for purchase history)</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-gray-500 uppercase tracking-wide border-b border-gray-100">
                  <th className="pb-2 font-medium">Ingredient</th>
                  <th className="pb-2 font-medium text-right">Was</th>
                  <th className="pb-2 font-medium text-right">Now</th>
                  <th className="pb-2 font-medium text-right">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {risingCostIngredients.map(r => (
                  <tr key={r.id} className="cursor-pointer hover:bg-gray-50" onClick={() => showIngredientPurchases(r.id, r.name)}>
                    <td className="py-2 text-gray-800">{r.name}</td>
                    <td className="py-2 text-right tabular-nums text-gray-500">{formatCurrency(r.prevAvg)}</td>
                    <td className="py-2 text-right tabular-nums text-gray-800">{formatCurrency(r.curAvg)}</td>
                    <td className="py-2 text-right tabular-nums font-medium text-red-600 flex items-center justify-end gap-1"><TrendingUp className="w-3 h-3" /> {r.pct.toFixed(0)}%</td>
                  </tr>
                ))}
                {risingCostIngredients.length === 0 && (
                  <tr><td colSpan={4} className="py-6 text-center text-gray-400">No ingredient costs rose &gt;5% this period</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <DrillDownPanel data={drilldown} onClose={() => setDrilldown(null)} />
    </div>
  )

  function showWasteForIngredientOnDay(dateKeyStr: string) {
    const rows = [
      ...wasteMovements.filter(w => dayKey(w.recorded_at) === dateKeyStr).map(w => ({
        ingredient: w.inventory_items?.name ?? 'Unknown', source: w.reason, qty: Number(w.quantity).toFixed(2), cost: formatCurrency(wasteCostOf(w)),
      })),
      ...prepBatches.filter(p => dayKey(p.date) === dateKeyStr).map(p => ({
        ingredient: p.inventory_items?.name ?? 'Unknown', source: `prep (${p.batch_number})`, qty: Number(p.waste_quantity).toFixed(2), cost: formatCurrency(prepWasteCostOf(p)),
      })),
    ]
    setDrilldown({
      title: `Waste on ${format(new Date(dateKeyStr), 'MMM d, yyyy')}`,
      subtitle: `${rows.length} records`,
      columns: [{ key: 'ingredient', label: 'Ingredient' }, { key: 'source', label: 'Source' }, { key: 'qty', label: 'Qty', align: 'right' }, { key: 'cost', label: 'Cost', align: 'right' }],
      rows,
    })
  }
}
