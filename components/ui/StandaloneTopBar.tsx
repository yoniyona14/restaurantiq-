'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

interface StandaloneTopBarProps {
  title: string
  subtitle?: string
  /** Where the back arrow should go. Pass null to hide it entirely. */
  backHref?: string | null
  backLabel?: string
  right?: React.ReactNode
}

export default function StandaloneTopBar({ title, subtitle, backHref = '/dashboard', backLabel = 'Back', right }: StandaloneTopBarProps) {
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    toast.success('Signed out')
    router.push('/auth/login')
  }

  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        {backHref && (
          <button
            onClick={() => router.push(backHref)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 hover:text-gray-900 transition-colors flex-shrink-0 text-xs font-medium"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> {backLabel}
          </button>
        )}
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {right}
        <button
          onClick={handleLogout}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 bg-white hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
          aria-label="Sign out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}