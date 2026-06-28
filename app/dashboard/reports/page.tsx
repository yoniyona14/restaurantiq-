'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import { FileText, FileSpreadsheet, Download } from 'lucide-react'
import { subDays, startOfMonth, startOfDay } from 'date-fns'

const REPORTS = [
  { id: 'daily', label: 'Daily report', desc: "Today's orders, revenue, and payments" },
  { id: 'weekly', label: 'Weekly report', desc: 'Last 7 days performance summary' },
  { id: 'monthly', label: 'Monthly report', desc: 'Full month revenue and trends' },
  { id: 'inventory', label: 'Inventory report', desc: 'Current stock levels and valuation' },
  { id: 'staff', label: 'Staff report', desc: 'Team performance this month' },
]

export default function ReportsPage() {
  const supabase = createClient()
  const [generating, setGenerating] = useState<string | null>(null)

  async function generateReport(reportId: string, format: 'pdf' | 'excel') {
    setGenerating(reportId)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase.from('users').select('restaurant_id, restaurants(name)').eq('id', user!.id).single()
      const rid = profile!.restaurant_id
      const restaurantName = (profile!.restaurants as any)?.name ?? 'Restaurant'

      let rows: any[] = []
      let title = ''

      if (reportId === 'daily' || reportId === 'weekly' || reportId === 'monthly') {
        const start = reportId === 'daily' ? startOfDay(new Date()) : reportId === 'weekly' ? subDays(new Date(), 7) : startOfMonth(new Date())
        const { data: orders } = await supabase
          .from('orders')
          .select('id, total, status, created_at, payments(method)')
          .eq('restaurant_id', rid)
          .gte('created_at', start.toISOString())
          .order('created_at', { ascending: false })

        title = `${restaurantName} - ${reportId} report`
        rows = (orders ?? []).map(o => ({
          'Order ID': o.id.slice(-6).toUpperCase(),
          'Date': formatDate(o.created_at, 'short'),
          'Status': o.status,
          'Payment': (o.payments as any)?.[0]?.method ?? '—',
          'Total (ETB)': o.total,
        }))
      } else if (reportId === 'inventory') {
        const { data: items } = await supabase.from('inventory_items').select('*').eq('restaurant_id', rid)
        title = `${restaurantName} - Inventory report`
        rows = (items ?? []).map(i => ({
          'Ingredient': i.name,
          'Current stock': `${i.current_stock} ${i.unit}`,
          'Reorder level': `${i.reorder_level} ${i.unit}`,
          'Unit cost (ETB)': i.unit_cost,
          'Total value (ETB)': (i.current_stock * i.unit_cost).toFixed(2),
        }))
      } else if (reportId === 'staff') {
        const { data: users } = await supabase.from('users').select('*').eq('restaurant_id', rid)
        const monthStart = startOfMonth(new Date()).toISOString()
        title = `${restaurantName} - Staff report`
        rows = await Promise.all((users ?? []).map(async (u) => {
          const { data: orders } = await supabase.from('orders').select('total').eq('cashier_id', u.id).eq('status', 'completed').gte('created_at', monthStart)
          return {
            'Name': u.name,
            'Role': u.role,
            'Orders this month': orders?.length ?? 0,
            'Revenue (ETB)': (orders?.reduce((s, o) => s + o.total, 0) ?? 0).toFixed(2),
          }
        }))
      }

      if (rows.length === 0) {
        toast.error('No data available for this report')
        setGenerating(null)
        return
      }

      if (format === 'excel') {
        const XLSX = await import('xlsx')
        const ws = XLSX.utils.json_to_sheet(rows)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Report')
        XLSX.writeFile(wb, `${reportId}-report-${Date.now()}.xlsx`)
      } else {
        const { default: jsPDF } = await import('jspdf')
        const autoTable = (await import('jspdf-autotable')).default
        const doc = new jsPDF()
        doc.setFontSize(14)
        doc.text(title, 14, 16)
        doc.setFontSize(9)
        doc.setTextColor(120)
        doc.text(`Generated ${formatDate(new Date(), 'long')}`, 14, 22)
        autoTable(doc, {
          startY: 28,
          head: [Object.keys(rows[0])],
          body: rows.map(r => Object.values(r)),
          styles: { fontSize: 8 },
          headStyles: { fillColor: [99, 102, 241] },
        })
        doc.save(`${reportId}-report-${Date.now()}.pdf`)
      }

      toast.success('Report downloaded')
    } catch (e) {
      toast.error('Failed to generate report')
    }
    setGenerating(null)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500">Download reports as PDF or Excel</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {REPORTS.map(report => (
          <div key={report.id} className="card p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 bg-brand-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5 text-brand-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">{report.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{report.desc}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => generateReport(report.id, 'pdf')}
                disabled={generating === report.id}
                className="btn-secondary flex-1 text-xs"
              >
                <Download className="w-3.5 h-3.5" /> PDF
              </button>
              <button
                onClick={() => generateReport(report.id, 'excel')}
                disabled={generating === report.id}
                className="btn-secondary flex-1 text-xs"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
