import { createClient } from '@/lib/supabase/server'
import { formatCurrency, percentChange } from '@/lib/utils'
import DashboardCharts from '@/components/dashboard/DashboardCharts'
import SmartInsights from '@/components/dashboard/SmartInsights'
import TopItemsTable from '@/components/dashboard/TopItemsTable'
import StaffTable from '@/components/dashboard/StaffTable'
import { TrendingUp, ShoppingBag, DollarSign, Users, AlertTriangle, Package, Flame, PieChart } from 'lucide-react'
import { startOfDay, startOfWeek, startOfMonth, subDays, subWeeks } from 'date-fns'
import Link from 'next/link'

export const metadata = { title: 'Dashboard' }
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('users').select('*, restaurants(name)').eq('id', user!.id).single()

  const rid = profile!.restaurant_id
  const now = new Date()
  const todayStart       = startOfDay(now).toISOString()
  const weekStart        = startOfWeek(now, { weekStartsOn: 1 }).toISOString()
  const monthStart       = startOfMonth(now).toISOString()
  const yesterdayStart   = startOfDay(subDays(now, 1)).toISOString()
  const lastWeekStart    = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }).toISOString()

  const [
    { data: todayOrders },
    { data: yesterdayOrders },
    { data: weekOrders },
    { data: lastWeekOrders },
    { data: monthOrders },
    { data: lowStock },
    { data: inventory },
    { data: wasteMovements },
    { data: purchaseMovements },
    { data: recentOrders },
  ] = await Promise.all([
    supabase.from('orders').select('total, cashier_id').eq('restaurant_id', rid).eq('status', 'completed').gte('created_at', todayStart),
    supabase.from('orders').select('total').eq('restaurant_id', rid).eq('status', 'completed').gte('created_at', yesterdayStart).lt('created_at', todayStart),
    supabase.from('orders').select('total').eq('restaurant_id', rid).eq('status', 'completed').gte('created_at', weekStart),
    supabase.from('orders').select('total').eq('restaurant_id', rid).eq('status', 'completed').gte('created_at', lastWeekStart).lt('created_at', weekStart),
    supabase.from('orders').select('total').eq('restaurant_id', rid).eq('status', 'completed').gte('created_at', monthStart),
    supabase.from('inventory_items').select('id, name').eq('restaurant_id', rid).filter('current_stock', 'lte', 'reorder_level'),
    supabase.from('inventory_items').select('current_stock, unit_cost').eq('restaurant_id', rid),
    supabase.from('inventory_movements').select('total_cost, reason').eq('restaurant_id', rid).in('reason', ['waste', 'spoilage', 'expired']).gte('recorded_at', monthStart),
    supabase.from('inventory_movements').select('total_cost').eq('restaurant_id', rid).eq('reason', 'purchase').gte('recorded_at', monthStart),
    supabase.from('orders').select('id, total, status, created_at').eq('restaurant_id', rid).order('created_at', { ascending: false }).limit(5),
  ])

  const todayRevenue    = todayOrders?.reduce((s, o) => s + o.total, 0) ?? 0
  const yesterdayRevenue = yesterdayOrders?.reduce((s, o) => s + o.total, 0) ?? 0
  const weekRevenue     = weekOrders?.reduce((s, o) => s + o.total, 0) ?? 0
  const lastWeekRevenue = lastWeekOrders?.reduce((s, o) => s + o.total, 0) ?? 0
  const monthRevenue    = monthOrders?.reduce((s, o) => s + o.total, 0) ?? 0
  const todayOrderCount = todayOrders?.length ?? 0
  const avgOrderValue   = todayOrderCount > 0 ? todayRevenue / todayOrderCount : 0
  const todayTrend      = percentChange(todayRevenue, yesterdayRevenue)
  const weekTrend       = percentChange(weekRevenue, lastWeekRevenue)

  const inventoryValue  = inventory?.reduce((s, i) => s + i.current_stock * i.unit_cost, 0) ?? 0
  const wasteCost       = wasteMovements?.reduce((s, m) => s + (m.total_cost ?? 0), 0) ?? 0
  const cogsPurchases   = purchaseMovements?.reduce((s, m) => s + (m.total_cost ?? 0), 0) ?? 0
  const grossProfit     = monthRevenue - cogsPurchases
  const grossMargin     = monthRevenue > 0 ? (grossProfit / monthRevenue) * 100 : 0
  const foodCostPct     = monthRevenue > 0 ? (cogsPurchases / monthRevenue) * 100 : 0

  const restaurantName = (profile!.restaurants as any)?.name ?? 'My Restaurant'

  const kpis = [
    { label: "Today's revenue",  value: formatCurrency(todayRevenue),  trend: todayTrend, icon: DollarSign, color: 'text-brand-600 bg-brand-50', sub: `${todayOrderCount} orders` },
    { label: 'Weekly revenue',   value: formatCurrency(weekRevenue),   trend: weekTrend,  icon: TrendingUp,  color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Monthly revenue',  value: formatCurrency(monthRevenue),  icon: ShoppingBag, color: 'text-blue-600 bg-blue-50', sub: `Avg ${formatCurrency(avgOrderValue)}/order` },
    { label: 'Gross profit',     value: formatCurrency(grossProfit),   icon: PieChart,    color: grossProfit >= 0 ? 'text-emerald-600 bg-emerald-50' : 'text-red-500 bg-red-50', sub: `${grossMargin.toFixed(1)}% margin` },
    { label: 'Food cost %',      value: `${foodCostPct.toFixed(1)}%`,  icon: Flame,       color: foodCostPct > 35 ? 'text-red-500 bg-red-50' : 'text-amber-600 bg-amber-50', sub: `${formatCurrency(cogsPurchases)} purchases` },
    { label: 'Waste this month', value: formatCurrency(wasteCost),     icon: AlertTriangle, color: 'text-red-500 bg-red-50' },
    { label: 'Inventory value',  value: formatCurrency(inventoryValue), icon: Package,    color: 'text-purple-600 bg-purple-50' },
    { label: 'Low stock alerts', value: String(lowStock?.length ?? 0), icon: AlertTriangle, color: (lowStock?.length ?? 0) > 0 ? 'text-amber-600 bg-amber-50' : 'text-gray-500 bg-gray-50' },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Good {getGreeting()}, {profile!.name.split(' ')[0]} 👋
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {restaurantName} · {new Date().toLocaleDateString('en-ET', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(lowStock?.length ?? 0) > 0 && (
            <Link href="/dashboard/inventory" className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm hover:bg-amber-100 transition-colors">
              <AlertTriangle className="w-4 h-4" />
              {lowStock!.length} low stock
            </Link>
          )}
          <Link href="/dashboard/health" className="flex items-center gap-2 px-3 py-2 bg-brand-50 border border-brand-200 rounded-lg text-brand-700 text-sm hover:bg-brand-100 transition-colors">
            Health Center →
          </Link>
        </div>
      </div>

      {/* KPI Grid — 4 cols on large screens */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon
          return (
            <div key={kpi.label} className="kpi-card">
              <div className="flex items-center justify-between">
                <span className="kpi-label">{kpi.label}</span>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${kpi.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <p className="kpi-value mt-1">{kpi.value}</p>
              {kpi.trend !== undefined && (
                <p className={kpi.trend >= 0 ? 'kpi-trend-up' : 'kpi-trend-down'}>
                  {kpi.trend >= 0 ? '↑' : '↓'} {Math.abs(kpi.trend)}% vs yesterday
                </p>
              )}
              {kpi.sub && <p className="text-xs text-gray-400">{kpi.sub}</p>}
            </div>
          )
        })}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 card p-5">
          <h2 className="text-sm font-medium text-gray-700 mb-4">Revenue — last 7 days</h2>
          <DashboardCharts restaurantId={rid} />
        </div>
        <div className="card p-5">
          <h2 className="text-sm font-medium text-gray-700 mb-4">Smart insights</h2>
          <SmartInsights restaurantId={rid} />
        </div>
      </div>

      {/* F&B Summary row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-5">
          <h2 className="text-sm font-medium text-gray-700 mb-3">Cost breakdown this month</h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Revenue</span>
              <span className="font-semibold text-gray-900">{formatCurrency(monthRevenue)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Purchases (COGS)</span>
              <span className="font-medium text-red-500">- {formatCurrency(cogsPurchases)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Waste</span>
              <span className="font-medium text-red-400">- {formatCurrency(wasteCost)}</span>
            </div>
            <div className="border-t border-gray-100 pt-3 flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700">Gross Profit</span>
              <span className={`font-bold text-lg ${grossProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatCurrency(grossProfit)}</span>
            </div>
            <div className="bg-gray-50 rounded-lg p-2">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Food cost target: 30%</span>
                <span className={foodCostPct > 35 ? 'text-red-500' : 'text-emerald-600'}>{foodCostPct.toFixed(1)}%</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${foodCostPct > 35 ? 'bg-red-500' : foodCostPct > 25 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min(foodCostPct, 100)}%` }} />
              </div>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="text-sm font-medium text-gray-700 mb-4">Top menu items this week</h2>
          <TopItemsTable restaurantId={rid} />
        </div>
        <div className="card p-5">
          <h2 className="text-sm font-medium text-gray-700 mb-4">Staff performance today</h2>
          <StaffTable restaurantId={rid} />
        </div>
      </div>

      {/* Quick links to new features */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { href: '/dashboard/recipes',         label: 'Recipe Management',   sub: 'Build & cost recipes',         color: 'bg-brand-50 border-brand-100 text-brand-700' },
          { href: '/dashboard/purchasing',       label: 'Purchase Orders',     sub: 'Manage suppliers & POs',       color: 'bg-emerald-50 border-emerald-100 text-emerald-700' },
          { href: '/dashboard/menu-engineering', label: 'Menu Engineering',    sub: 'Stars, dogs & profit matrix',  color: 'bg-yellow-50 border-yellow-100 text-yellow-700' },
          { href: '/dashboard/production',       label: 'Production Planning', sub: 'AI prep recommendations',      color: 'bg-purple-50 border-purple-100 text-purple-700' },
        ].map(link => (
          <Link key={link.href} href={link.href} className={`card p-4 border hover:shadow-md transition-all ${link.color}`}>
            <p className="text-sm font-semibold">{link.label}</p>
            <p className="text-xs opacity-70 mt-0.5">{link.sub}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
