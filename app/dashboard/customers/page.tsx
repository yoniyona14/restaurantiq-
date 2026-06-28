'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Customer } from '@/types'

export default function CustomersPage() {
  const supabase = createClient()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: profile } = await supabase.from('users').select('restaurant_id').eq('id', user!.id).single()
      const { data } = await supabase.from('customers').select('*').eq('restaurant_id', profile!.restaurant_id).order('total_spent', { ascending: false })
      setCustomers(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Loading customers…</div>

  const returning = customers.filter(c => c.visit_count > 1).length
  const retention = customers.length > 0 ? Math.round((returning / customers.length) * 100) : 0
  const avgSpend = customers.length > 0 ? customers.reduce((s, c) => s + c.total_spent, 0) / customers.length : 0

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Customers</h1>
        <p className="text-sm text-gray-500">{customers.length} customers tracked</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="kpi-card">
          <span className="kpi-label">Returning customers</span>
          <p className="kpi-value">{returning}</p>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Retention rate</span>
          <p className="kpi-value">{retention}%</p>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Avg. customer spend</span>
          <p className="kpi-value">{formatCurrency(avgSpend)}</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-xs text-gray-500 font-medium">
              <th className="text-left px-4 py-3">Customer</th>
              <th className="text-left px-4 py-3">Phone</th>
              <th className="text-right px-4 py-3">Visits</th>
              <th className="text-right px-4 py-3">Total spent</th>
              <th className="text-right px-4 py-3">Last visit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {customers.map(c => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                <td className="px-4 py-3 text-gray-500">{c.phone ?? '—'}</td>
                <td className="px-4 py-3 text-right text-gray-700">{c.visit_count}</td>
                <td className="px-4 py-3 text-right font-medium text-emerald-600">{formatCurrency(c.total_spent)}</td>
                <td className="px-4 py-3 text-right text-gray-400 text-xs">{c.last_visit ? formatDate(c.last_visit) : '—'}</td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr><td colSpan={5} className="text-center py-12 text-gray-400 text-sm">No customers yet. They'll appear here as orders are placed.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
