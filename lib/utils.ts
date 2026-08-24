// lib/utils.ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency = 'ETB') {
  return `${currency} ${amount.toLocaleString('en-ET', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatDate(date: string | Date, format: 'short' | 'long' | 'time' = 'short') {
  const d = new Date(date)
  if (format === 'time') return d.toLocaleTimeString('en-ET', { hour: '2-digit', minute: '2-digit' })
  if (format === 'long') return d.toLocaleDateString('en-ET', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  return d.toLocaleDateString('en-ET', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function percentChange(current: number, previous: number) {
  if (previous === 0) return 0
  return Math.round(((current - previous) / previous) * 100)
}

export const TAX_RATE = 0.15 // 15% Ethiopian VAT

export function calculateOrderTotals(subtotal: number, discount = 0) {
  const discounted = subtotal - discount
  const tax = discounted * TAX_RATE
  const total = discounted + tax
  return { subtotal, discount, tax, total }
}

export const STATUS_COLORS: Record<string, string> = {
  pending:   'bg-amber-100 text-amber-800',
  preparing: 'bg-blue-100 text-blue-800',
  ready:     'bg-teal-100 text-teal-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
}

export const ROLE_COLORS: Record<string, string> = {
  owner:   'bg-purple-100 text-purple-800',
  manager: 'bg-blue-100 text-blue-800',
  cashier: 'bg-green-100 text-green-800',
  kitchen: 'bg-orange-100 text-orange-800',
}

export const PAYMENT_LABELS: Record<string, string> = {
  cash:          'Cash',
  telebirr:      'Telebirr',
  cbe_birr:      'CBE Birr',
  bank_transfer: 'Bank Transfer',
}
