'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Props { restaurantId: string }

export default function DashboardRealtimeRefresh({ restaurantId }: Props) {
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    if (!restaurantId) return
    const channel = supabase
      .channel('dashboard-kpi-refresh')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` },
        () => { router.refresh() }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [restaurantId])

  return null
}