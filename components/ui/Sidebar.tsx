'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import { LogOut, Zap, QrCode } from 'lucide-react'
import { NAV_ITEMS } from '@/lib/access'
import type { UserRole } from '@/types'

const navItems = NAV_ITEMS

interface SidebarProps {
  role: UserRole
  restaurantName: string
  userName: string
}

export default function Sidebar({ role, restaurantName, userName }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const filtered = navItems.filter(item => item.roles.includes(role))

  async function handleLogout() {
    await supabase.auth.signOut()
    toast.success('Signed out')
    router.push('/auth/login')
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
        {filtered.map(item => {
          const Icon = item.icon
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn('nav-item', isActive && 'active')}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {item.label}
            </Link>
          )
        })}

        {/* QR Codes — owner/manager only */}
        {['owner', 'manager'].includes(role) && (
          <Link href="/dashboard/menu?tab=qr" className={cn('nav-item', pathname.includes('qr') && 'active')}>
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