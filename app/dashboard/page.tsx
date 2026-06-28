import { createClient } from '@/lib/supabase/server'
import { formatCurrency, percentChange } from '@/lib/utils'
import DashboardCharts from '@/components/dashboard/DashboardCharts'
import DashboardRealtimeRefresh from '@/components/dashboard/DashboardRealtimeRefresh'
import SmartInsights from '@/components/dashboard/SmartInsights'
import TopItemsTable from '@/components/dashboard/TopItemsTable'
import StaffTable from '@/components/dashboard/StaffTable'
import { TrendingUp, TrendingDown, ShoppingBag, DollarSign, Users, AlertTriangle } from 'lucide-react'
import { startOfDay, startOfWeek, startOfMonth, subDays, subWeeks } from 'date-fns'

export const metadata = { title: 'Dashboard' }
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('users').select('*, restaurants(name)').eq('id', user!.id).single()

  const rid = profile!.restaurant_id
  const now = new Date()
  const todayStart  = startOfDay(now).toISOString()
  const weekStart   = startOfWeek(now, { weekStartsOn: 1 }).toISOString()
  const monthStart  = startOfMonth(now).toISOString()
  const yesterdayStart = startOfDay(subDays(now, 1)).toISOString()
  const lastWeekStart  = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }).toISOString()

  // Parallel data fetching
  const [
    { data: todayOrders },
    { data: yesterdayOrders },
    { data: weekOrders },
    { data: lastWeekOrders },
    { data: monthOrders },
    { data: lowStock },
    { data: recentOrders },
  ] = await Promise.all([
    supabase.from('orders').select('total, cashier_id').eq('restaurant_id', rid).eq('status', 'completed').gte('created_at', todayStart),
    supabase.from('orders').select('total').eq('restaurant_id', rid).eq('status', 'completed').gte('created_at', yesterdayStart).lt('created_at', todayStart),
    supabase.from('orders').select('total').eq('restaurant_id', rid).eq('status', 'completed').gte('created_at', weekStart),
    supabase.from('orders').select('total').eq('restaurant_id', rid).eq('status', 'completed').gte('created_at', lastWeekStart).lt('created_at', weekStart),
    supabase.from('orders').select('total').eq('restaurant_id', rid).eq('status', 'completed').gte('created_at', monthStart),
    supabase.from('inventory_items').select('id').eq('restaurant_id', rid).filter('current_stock', 'lte', 'reorder_level'),
    supabase.from('orders').select('id, total, status, created_at, customers(name)').eq('restaurant_id', rid).order('created_at', { ascending: false }).limit(5),
  ])

  const todayRevenue    = todayOrders?.reduce((s, o) => s + o.total, 0) ?? 0
  const yesterdayRevenue= yesterdayOrders?.reduce((s, o) => s + o.total, 0) ?? 0
  const weekRevenue     = weekOrders?.reduce((s, o) => s + o.total, 0) ?? 0
  const lastWeekRevenue = lastWeekOrders?.reduce((s, o) => s + o.total, 0) ?? 0
  const monthRevenue    = monthOrders?.reduce((s, o) => s + o.total, 0) ?? 0
  const todayOrderCount = todayOrders?.length ?? 0
  const avgOrderValue   = todayOrderCount > 0 ? todayRevenue / todayOrderCount : 0

  const todayTrend    = percentChange(todayRevenue, yesterdayRevenue)
  const weekTrend     = percentChange(weekRevenue, lastWeekRevenue)

  const restaurantName = (profile!.restaurants as any)?.name ?? 'My Restaurant'

  const kpis = [
    {
      label: "Today's revenue",
      value: formatCurrency(todayRevenue),
      trend: todayTrend,
      icon: DollarSign,
      color: 'text-brand-600 bg-brand-50',
    },
    {
      label: 'Weekly revenue',
      value: formatCurrency(weekRevenue),
      trend: weekTrend,
      icon: TrendingUp,
      color: 'text-emerald-600 bg-emerald-50',
    },
    {
      label: 'Orders today',
      value: todayOrderCount.toString(),
      sub: `Avg ${formatCurrency(avgOrderValue)}`,
      icon: ShoppingBag,
      color: 'text-blue-600 bg-blue-50',
    },
    {
      label: 'Monthly revenue',
      value: formatCurrency(monthRevenue),
      icon: Users,
      color: 'text-purple-600 bg-purple-50',
    },
  ]

return (
    <div className="space-y-6 animate-fade-in">
      <DashboardRealtimeRefresh restaurantId={rid} />
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
        {(lowStock?.length ?? 0) > 0 && (
          <a href="/dashboard/inventory" className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm hover:bg-amber-100 transition-colors">
            <AlertTriangle className="w-4 h-4" />
            {lowStock!.length} low stock {lowStock!.length === 1 ? 'item' : 'items'}
          </a>
        )}
      </div>

      {/* KPI Cards */}
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

      {/* Bottom tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="text-sm font-medium text-gray-700 mb-4">Top menu items this week</h2>
          <TopItemsTable restaurantId={rid} />
        </div>
        <div className="card p-5">
          <h2 className="text-sm font-medium text-gray-700 mb-4">Staff performance today</h2>
          <StaffTable restaurantId={rid} />
        </div>
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
