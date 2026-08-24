import type { UserRole } from '@/types'
import {
  LayoutDashboard, ShoppingCart, ChefHat, UtensilsCrossed,
  Package, Users, FileText, Settings, UserCircle2,
  Truck, Building2, BookOpen, HeartPulse, FlaskConical,
  BarChart2, Factory,
} from 'lucide-react'

export interface NavItem {
  href: string
  label: string
  icon: typeof LayoutDashboard
  roles: UserRole[]
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard',                  label: 'Dashboard',        icon: LayoutDashboard, roles: ['owner', 'manager'] },
  { href: '/pos',                        label: 'POS',              icon: ShoppingCart,    roles: ['owner', 'manager', 'cashier'] },
  { href: '/kitchen',                    label: 'Kitchen',          icon: ChefHat,         roles: ['owner', 'manager', 'kitchen'] },
  { href: '/dashboard/orders',           label: 'Orders',           icon: UtensilsCrossed, roles: ['owner', 'manager', 'cashier'] },
  { href: '/dashboard/menu',             label: 'Menu',             icon: UtensilsCrossed, roles: ['owner', 'manager'] },
  { href: '/dashboard/recipes',          label: 'Recipes',          icon: BookOpen,        roles: ['owner', 'manager'] },
  { href: '/dashboard/menu-engineering', label: 'Menu Engineering', icon: BarChart2,       roles: ['owner', 'manager'] },
  // Inventory group (shown as dropdown in sidebar)
  { href: '/dashboard/inventory',        label: 'Stock Levels',     icon: Package,         roles: ['owner', 'manager'] },
  { href: '/dashboard/prep-batches',     label: 'Prep Batches',     icon: FlaskConical,    roles: ['owner', 'manager'] },
  { href: '/dashboard/production',       label: 'Production',       icon: Factory,         roles: ['owner', 'manager'] },
  { href: '/dashboard/purchasing',       label: 'Purchasing',       icon: Truck,           roles: ['owner', 'manager'] },
  { href: '/dashboard/suppliers',        label: 'Suppliers',        icon: Building2,       roles: ['owner', 'manager'] },
  // Others
  { href: '/dashboard/health',           label: 'Health Center',    icon: HeartPulse,      roles: ['owner', 'manager'] },
  { href: '/dashboard/staff',            label: 'Staff',            icon: Users,           roles: ['owner', 'manager'] },
  { href: '/dashboard/customers',        label: 'Customers',        icon: UserCircle2,     roles: ['owner', 'manager'] },
  { href: '/dashboard/reports',          label: 'Reports',          icon: FileText,        roles: ['owner', 'manager'] },
  { href: '/dashboard/settings',         label: 'Settings',         icon: Settings,        roles: ['owner'] },
]

export const ROLE_HOME: Record<UserRole, string> = {
  owner:   '/dashboard',
  manager: '/dashboard',
  cashier: '/pos',
  kitchen: '/kitchen',
}

export function canAccess(role: UserRole, pathname: string): boolean {
  const matches = NAV_ITEMS.filter(
    item => pathname === item.href || pathname.startsWith(item.href + '/')
  )
  if (matches.length === 0) return true
  const best = matches.reduce((a, b) => (b.href.length > a.href.length ? b : a))
  return best.roles.includes(role)
}
