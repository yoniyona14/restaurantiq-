// lib/access.ts
// Single source of truth for "who can see/access what" in the app.
// Used by middleware.ts (server-side enforcement) and Sidebar.tsx (nav display).

import type { UserRole } from '@/types'
import {
  LayoutDashboard, ShoppingCart, ChefHat, UtensilsCrossed,
  Package, Users, BarChart3, FileText, Settings, UserCircle2,
} from 'lucide-react'

export interface NavItem {
  href: string
  label: string
  icon: typeof LayoutDashboard
  roles: UserRole[]
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard',           label: 'Dashboard',  icon: LayoutDashboard, roles: ['owner', 'manager'] },
  { href: '/pos',                 label: 'POS',        icon: ShoppingCart,    roles: ['owner', 'manager' , 'cashier'] },
  { href: '/kitchen',             label: 'Kitchen',    icon: ChefHat,         roles: ['owner', 'manager', 'kitchen'] },
  { href: '/dashboard/orders',    label: 'Orders',     icon: UtensilsCrossed, roles: ['owner', 'manager', 'cashier'] },
  { href: '/dashboard/menu',      label: 'Menu',       icon: UtensilsCrossed, roles: ['owner', 'manager'] },
  { href: '/dashboard/inventory', label: 'Inventory',  icon: Package,         roles: ['owner', 'manager'] },
  { href: '/dashboard/staff',     label: 'Staff',      icon: Users,           roles: ['owner', 'manager'] },
  { href: '/dashboard/customers', label: 'Customers',  icon: UserCircle2,     roles: ['owner', 'manager'] },
  { href: '/dashboard/analytics', label: 'Analytics',  icon: BarChart3,       roles: ['owner', 'manager'] },
  { href: '/dashboard/reports',   label: 'Reports',    icon: FileText,        roles: ['owner', 'manager'] },
  { href: '/dashboard/settings',  label: 'Settings',   icon: Settings,        roles: ['owner'] },
]

// The route each role should land on when blocked, or right after login.
export const ROLE_HOME: Record<UserRole, string> = {
  owner: '/dashboard',
  manager: '/dashboard',
  cashier: '/pos',
  kitchen: '/kitchen',
}

/**
 * Returns true if `role` is allowed to access `pathname`.
 * Matches the most specific NAV_ITEMS entry (longest matching href prefix).
 * Routes not present in NAV_ITEMS (e.g. /auth, /menu, /api) are allowed
 * by default — middleware handles those separately.
 */
export function canAccess(role: UserRole, pathname: string): boolean {
  const matches = NAV_ITEMS.filter(
    item => pathname === item.href || pathname.startsWith(item.href + '/')
  )
  if (matches.length === 0) return true
  const best = matches.reduce((a, b) => (b.href.length > a.href.length ? b : a))
  return best.roles.includes(role)
}