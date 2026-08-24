'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import { LogOut, Zap, QrCode, ChevronDown, ChevronRight } from 'lucide-react'
import { NAV_ITEMS, type NavItem } from '@/lib/access'
import type { UserRole } from '@/types'
import { useState } from 'react'

// Items grouped under the "Inventory" dropdown
const INVENTORY_HREFS = [
  '/dashboard/inventory',
  '/dashboard/prep-batches',
  '/dashboard/production',
  '/dashboard/purchasing',
  '/dashboard/suppliers',
]

interface SidebarProps {
  role: UserRole
  restaurantName: string
  userName: string
}

export default function Sidebar({ role, restaurantName, userName }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const isInInventorySection = INVENTORY_HREFS.some(h => pathname.startsWith(h))
  const [inventoryOpen, setInventoryOpen] = useState(isInInventorySection)

  const allItems = NAV_ITEMS.filter(item => item.roles.includes(role))

  // Split into top-level and inventory-group items
  const inventoryItems = allItems.filter(item => INVENTORY_HREFS.includes(item.href))
  const topItems = allItems.filter(item => !INVENTORY_HREFS.includes(item.href))

  // Find the first inventory item to grab the icon
  const { Package } = require('lucide-react')

  async function handleLogout() {
    await supabase.auth.signOut()
    toast.success('Signed out')
    router.push('/auth/login')
  }

  function NavLink({ item }: { item: NavItem }) {
    const Icon = item.icon
    const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
    return (
      <Link key={item.href} href={item.href} className={cn('nav-item', isActive && 'active')}>
        <Icon className="w-4 h-4 flex-shrink-0" />
        {item.label}
      </Link>
    )
  }

  return (
    <aside className="w-60 bg-white border-r border-gray-100 flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">RestaurantIQ</p>
            <p className="text-xs text-gray-400 truncate">{restaurantName}</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">

        {/* Dashboard */}
        {topItems.filter(i => i.href === '/dashboard').map(item => <NavLink key={item.href} item={item} />)}

        {/* POS */}
        {topItems.filter(i => i.href === '/pos').map(item => <NavLink key={item.href} item={item} />)}

        {/* Kitchen */}
        {topItems.filter(i => i.href === '/kitchen').map(item => <NavLink key={item.href} item={item} />)}

        {/* Orders */}
        {topItems.filter(i => i.href === '/dashboard/orders').map(item => <NavLink key={item.href} item={item} />)}

        {/* Menu & Recipes */}
        {topItems.filter(i => ['/dashboard/menu', '/dashboard/recipes', '/dashboard/menu-engineering'].includes(i.href)).map(item => <NavLink key={item.href} item={item} />)}

        {/* Inventory dropdown group */}
        {inventoryItems.length > 0 && (
          <div>
            <button
              onClick={() => setInventoryOpen(!inventoryOpen)}
              className={cn(
                'nav-item w-full justify-between',
                isInInventorySection && 'bg-brand-50 text-brand-700'
              )}
            >
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 flex-shrink-0" />
                <span>Inventory</span>
              </div>
              {inventoryOpen
                ? <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                : <ChevronRight className="w-3.5 h-3.5 opacity-60" />
              }
            </button>
            {inventoryOpen && (
              <div className="ml-4 mt-0.5 space-y-0.5 border-l-2 border-gray-100 pl-2">
                {inventoryItems.map(item => {
                  const Icon = item.icon
                  const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                  return (
                    <Link key={item.href} href={item.href} className={cn('nav-item text-xs py-1.5', isActive && 'active')}>
                      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Health Center */}
        {topItems.filter(i => i.href === '/dashboard/health').map(item => <NavLink key={item.href} item={item} />)}

        {/* Staff, Customers, Reports, Settings */}
        {topItems.filter(i => ['/dashboard/staff', '/dashboard/customers', '/dashboard/reports', '/dashboard/settings'].includes(i.href)).map(item => <NavLink key={item.href} item={item} />)}

        {/* QR Codes */}
        {['owner', 'manager'].includes(role) && (
          <Link href="/dashboard/menu?tab=qr" className={cn('nav-item', pathname.includes('tab=qr') && 'active')}>
            <QrCode className="w-4 h-4 flex-shrink-0" />
            QR Codes
          </Link>
        )}
      </nav>

      {/* Footer */}
      <div className="px-2 py-3 border-t border-gray-100 space-y-0.5">
        <div className="px-3 py-2 flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-semibold text-brand-700">{userName.charAt(0).toUpperCase()}</span>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-700 truncate">{userName}</p>
            <p className="text-xs text-gray-400 capitalize">{role}</p>
          </div>
        </div>
        <button onClick={handleLogout} className="nav-item w-full text-red-500 hover:bg-red-50 hover:text-red-600">
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
